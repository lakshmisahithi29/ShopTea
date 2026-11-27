import { Request, Response } from 'express';
import { prisma } from '../utils/prisma';
import { UnauthorizedError } from '../utils/errors';
import { withReplenishmentFields } from '../services/stockStatus';
import { roundMoney, toNumber } from '../utils/numbers';
import { eachDayInclusive, isoDay, parseDashboardRange } from '../utils/dateRange';

function getShopId(req: Request): string {
  const shopId = req.user?.shopId;
  if (!shopId) {
    throw new UnauthorizedError('Shop profile required. Please complete shop setup.');
  }
  return shopId;
}

function movementValue(tx: any): number {
  if (tx.totalCost !== null && tx.totalCost !== undefined) {
    return roundMoney(toNumber(tx.totalCost));
  }
  const qty = toNumber(tx.quantity);
  const rate = tx.unitCost !== null && tx.unitCost !== undefined
    ? toNumber(tx.unitCost)
    : toNumber(tx.item?.unitCost);
  return roundMoney(qty * rate);
}

function signedMovementValue(tx: any): number {
  const value = movementValue(tx);
  return tx.type === 'REVERSAL' ? -value : value;
}

function serializeMovement(tx: any) {
  return {
    id: tx.id,
    type: tx.type,
    status: tx.status,
    reversalOfId: tx.reversalOfId || null,
    quantity: toNumber(tx.quantity),
    unit: tx.item?.unit || null,
    unitCost: tx.unitCost !== null && tx.unitCost !== undefined ? toNumber(tx.unitCost) : null,
    totalCost: tx.totalCost !== null && tx.totalCost !== undefined ? toNumber(tx.totalCost) : movementValue(tx),
    value: signedMovementValue(tx),
    wastageReason: tx.wastageReason || null,
    remarks: tx.remarks || null,
    reference: tx.reference || null,
    date: tx.date,
    item: tx.item
      ? {
          id: tx.item.id,
          name: tx.item.name,
          unit: tx.item.unit,
          category: tx.item.category,
          unitCost: toNumber(tx.item.unitCost),
        }
      : null,
    supplier: tx.supplier ? { id: tx.supplier.id, name: tx.supplier.name } : null,
  };
}

/** GET /api/dashboard/summary */
export async function getDashboardSummary(req: Request, res: Response) {
  const shopId = getShopId(req);

  const items = await prisma.inventoryItem.findMany({
    where: { shopId, isActive: true },
    include: { supplier: true },
  });

  const enriched = items.map(withReplenishmentFields);
  const outOfStock = enriched.filter((i) => i.status === 'OUT_OF_STOCK');
  const lowStock = enriched.filter((i) => i.status === 'LOW_STOCK');
  const needing = enriched.filter((i) => i.status !== 'HEALTHY');

  const totalInventoryValue = roundMoney(
    enriched.reduce((sum, item) => sum + item.currentStock * item.unitCost, 0)
  );

  const stockValueByCategory = Object.values(
    enriched.reduce((acc: Record<string, { category: string; value: number; itemCount: number }>, item) => {
      if (!acc[item.category]) {
        acc[item.category] = { category: item.category, value: 0, itemCount: 0 };
      }
      acc[item.category].value += item.currentStock * item.unitCost;
      acc[item.category].itemCount += 1;
      return acc;
    }, {})
  ).map((row) => ({ ...row, value: roundMoney(row.value) }))
    .sort((a, b) => b.value - a.value);

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);
  const [salesToday, saleCostToday] = await Promise.all([
    prisma.sale.aggregate({
      where: { shopId, status: 'ACTIVE', date: { gte: todayStart, lte: todayEnd } },
      _sum: { total: true },
      _count: true,
    }),
    prisma.stockTransaction.aggregate({
      where: { shopId, saleId: { not: null }, type: 'USAGE', status: 'ACTIVE', date: { gte: todayStart, lte: todayEnd } },
      _sum: { totalCost: true },
    }),
  ]);
  const salesRevenueToday = roundMoney(Number(salesToday._sum.total || 0));
  const cogsToday = roundMoney(Number(saleCostToday._sum.totalCost || 0));

  const topItemsByStock = [...enriched]
    .sort((a, b) => b.currentStock - a.currentStock)
    .slice(0, 8)
    .map((item) => ({
      id: item.id,
      name: item.name,
      unit: item.unit,
      category: item.category,
      currentStock: item.currentStock,
      status: item.status,
    }));

  res.status(200).json({
    success: true,
    summary: {
      totalActiveItems: enriched.length,
      totalInventoryValue,
      lowStockCount: lowStock.length,
      outOfStockCount: outOfStock.length,
      itemsNeedingReplenishment: needing.length,
      salesCountToday: salesToday._count,
      salesRevenueToday,
      cogsToday,
      grossProfitToday: roundMoney(salesRevenueToday - cogsToday),
    },
    topItemsByStock,
    lowStockItems: lowStock.slice(0, 6).map((item) => ({
      id: item.id,
      name: item.name,
      unit: item.unit,
      currentStock: item.currentStock,
      minStock: item.minStock,
      status: item.status,
    })),
    outOfStockItems: outOfStock.slice(0, 6).map((item) => ({
      id: item.id,
      name: item.name,
      unit: item.unit,
      currentStock: item.currentStock,
      status: item.status,
    })),
    stockValueByCategory,
  });
}

/** GET /api/dashboard/recent-movements */
export async function getRecentMovements(req: Request, res: Response) {
  const shopId = getShopId(req);

  const transactions = await prisma.stockTransaction.findMany({
    where: { shopId },
    orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
    take: 10,
    include: { item: true, supplier: true },
  });

  res.status(200).json({
    success: true,
    movements: transactions.map(serializeMovement),
  });
}

/** GET /api/dashboard/movement-trend */
export async function getMovementTrend(req: Request, res: Response) {
  const shopId = getShopId(req);
  const { from, to } = parseDashboardRange(req.query.from as string | undefined, req.query.to as string | undefined);

  const transactions = await prisma.stockTransaction.findMany({
    where: {
      shopId,
      date: { gte: from, lte: to },
      type: { in: ['PURCHASE', 'USAGE', 'REVERSAL'] },
    },
    include: { item: true, reversalOf: true },
  });

  const days = eachDayInclusive(from, to);
  const byDay = new Map(days.map((day) => [day, { date: day, purchaseValue: 0, usageValue: 0 }]));

  for (const tx of transactions) {
    const day = isoDay(tx.date);
    const bucket = byDay.get(day);
    if (!bucket) continue;
    const value = signedMovementValue(tx);
    const effectiveType = tx.type === 'REVERSAL' ? tx.reversalOf?.type : tx.type;
    if (effectiveType === 'PURCHASE') bucket.purchaseValue = roundMoney(bucket.purchaseValue + value);
    if (effectiveType === 'USAGE') bucket.usageValue = roundMoney(bucket.usageValue + value);
  }

  res.status(200).json({
    success: true,
    from: from.toISOString(),
    to: to.toISOString(),
    series: Array.from(byDay.values()),
    totals: {
      purchaseValue: roundMoney(
        Array.from(byDay.values()).reduce((sum, d) => sum + d.purchaseValue, 0)
      ),
      usageValue: roundMoney(Array.from(byDay.values()).reduce((sum, d) => sum + d.usageValue, 0)),
    },
  });
}

/** GET /api/dashboard/wastage-summary */
export async function getWastageSummary(req: Request, res: Response) {
  const shopId = getShopId(req);
  const { from, to } = parseDashboardRange(req.query.from as string | undefined, req.query.to as string | undefined);

  const transactions = await prisma.stockTransaction.findMany({
    where: {
      shopId,
      type: 'WASTAGE',
      date: { gte: from, lte: to },
    },
    include: { item: true },
  });

  const byReason = new Map<string, { reason: string; value: number; quantityByUnit: Record<string, number>; count: number }>();
  const byItem = new Map<
    string,
    { itemId: string; name: string; unit: string; quantity: number; value: number }
  >();
  const quantityByUnit: Record<string, number> = {};

  let totalValue = 0;

  for (const tx of transactions) {
    const value = movementValue(tx);
    const qty = toNumber(tx.quantity);
    const unit = tx.item?.unit || 'UNKNOWN';
    const reason = tx.wastageReason || 'OTHER';

    totalValue += value;
    quantityByUnit[unit] = roundQtySafe((quantityByUnit[unit] || 0) + qty);

    if (!byReason.has(reason)) {
      byReason.set(reason, { reason, value: 0, quantityByUnit: {}, count: 0 });
    }
    const reasonRow = byReason.get(reason)!;
    reasonRow.value = roundMoney(reasonRow.value + value);
    reasonRow.count += 1;
    reasonRow.quantityByUnit[unit] = roundQtySafe((reasonRow.quantityByUnit[unit] || 0) + qty);

    const itemId = tx.itemId;
    if (!byItem.has(itemId)) {
      byItem.set(itemId, {
        itemId,
        name: tx.item?.name || 'Unknown item',
        unit,
        quantity: 0,
        value: 0,
      });
    }
    const itemRow = byItem.get(itemId)!;
    itemRow.quantity = roundQtySafe(itemRow.quantity + qty);
    itemRow.value = roundMoney(itemRow.value + value);
  }

  res.status(200).json({
    success: true,
    from: from.toISOString(),
    to: to.toISOString(),
    totalValue: roundMoney(totalValue),
    transactionCount: transactions.length,
    quantityByUnit,
    byReason: Array.from(byReason.values()).sort((a, b) => b.value - a.value),
    byItem: Array.from(byItem.values()).sort((a, b) => b.value - a.value),
  });
}

function roundQtySafe(value: number): number {
  return Number(value.toFixed(3));
}

/** GET /api/dashboard/wastage-trend */
export async function getWastageTrend(req: Request, res: Response) {
  const shopId = getShopId(req);
  const { from, to } = parseDashboardRange(req.query.from as string | undefined, req.query.to as string | undefined);

  const transactions = await prisma.stockTransaction.findMany({
    where: {
      shopId,
      type: 'WASTAGE',
      date: { gte: from, lte: to },
    },
    include: { item: true },
  });

  const days = eachDayInclusive(from, to);
  const byDay = new Map(days.map((day) => [day, { date: day, value: 0, count: 0 }]));

  for (const tx of transactions) {
    const day = isoDay(tx.date);
    const bucket = byDay.get(day);
    if (!bucket) continue;
    bucket.value = roundMoney(bucket.value + movementValue(tx));
    bucket.count += 1;
  }

  res.status(200).json({
    success: true,
    from: from.toISOString(),
    to: to.toISOString(),
    series: Array.from(byDay.values()),
    totalValue: roundMoney(Array.from(byDay.values()).reduce((sum, d) => sum + d.value, 0)),
  });
}

/** GET /api/dashboard/replenishment */
export async function getDashboardReplenishment(req: Request, res: Response) {
  const shopId = getShopId(req);

  const items = await prisma.inventoryItem.findMany({
    where: { shopId, isActive: true },
    include: { supplier: true },
  });

  const needing = items
    .map(withReplenishmentFields)
    .filter((item) => item.status !== 'HEALTHY')
    .sort((a, b) => {
      const order = { OUT_OF_STOCK: 0, LOW_STOCK: 1, NEEDS_REORDER: 2, HEALTHY: 3 } as const;
      const urgency = order[a.status] - order[b.status];
      if (urgency !== 0) return urgency;
      return b.suggestedQty * b.unitCost - a.suggestedQty * a.unitCost;
    })
    .slice(0, 8)
    .map((item) => ({
      id: item.id,
      name: item.name,
      unit: item.unit,
      category: item.category,
      currentStock: item.currentStock,
      targetStock: item.targetStock,
      suggestedQty: item.suggestedQty,
      estimatedCost: item.estimatedCost,
      status: item.status,
      supplier: item.supplier ? { id: item.supplier.id, name: item.supplier.name } : null,
    }));

  res.status(200).json({
    success: true,
    items: needing,
  });
}
