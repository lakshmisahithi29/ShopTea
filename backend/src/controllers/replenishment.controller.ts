import { Request, Response } from 'express';
import { prisma } from '../utils/prisma';
import { UnauthorizedError } from '../utils/errors';
import {
  withReplenishmentFields,
  type StockStatus,
} from '../services/stockStatus';
import { roundMoney } from '../utils/numbers';

function getShopId(req: Request): string {
  const shopId = req.user?.shopId;
  if (!shopId) {
    throw new UnauthorizedError('Shop profile required. Please complete shop setup.');
  }
  return shopId;
}

const URGENCY: Record<StockStatus, number> = {
  OUT_OF_STOCK: 0,
  LOW_STOCK: 1,
  NEEDS_REORDER: 2,
  HEALTHY: 3,
};

function serializeAlertItem(item: ReturnType<typeof withReplenishmentFields>) {
  return {
    id: item.id,
    name: item.name,
    category: item.category,
    unit: item.unit,
    currentStock: item.currentStock,
    minStock: item.minStock,
    reorderLevel: item.reorderLevel,
    targetStock: item.targetStock,
    unitCost: item.unitCost,
    supplierId: item.supplierId || null,
    supplier: item.supplier
      ? { id: item.supplier.id, name: item.supplier.name, phone: item.supplier.phone }
      : null,
    status: item.status,
    suggestedQty: item.suggestedQty,
    estimatedCost: item.estimatedCost,
  };
}

/** GET /api/replenishment/alerts */
export async function getAlerts(req: Request, res: Response) {
  const shopId = getShopId(req);

  const items = await prisma.inventoryItem.findMany({
    where: { shopId, isActive: true },
    include: { supplier: true },
    orderBy: { name: 'asc' },
  });

  const outOfStock = items
    .map(withReplenishmentFields)
    .filter((item) => item.status === 'OUT_OF_STOCK')
    .map(serializeAlertItem);

  const lowStock = items
    .map(withReplenishmentFields)
    .filter((item) => item.status === 'LOW_STOCK')
    .map(serializeAlertItem);

  res.status(200).json({
    success: true,
    outOfStockCount: outOfStock.length,
    lowStockCount: lowStock.length,
    alertCount: outOfStock.length + lowStock.length,
    outOfStock,
    lowStock,
  });
}

/** GET /api/replenishment/reorder-list */
export async function getReorderList(req: Request, res: Response) {
  const shopId = getShopId(req);
  const { supplierId, category, status: statusFilter } = req.query as {
    supplierId?: string;
    category?: string;
    status?: StockStatus;
  };

  const where: Record<string, unknown> = { shopId, isActive: true };
  if (category) where.category = category;
  if (supplierId && supplierId !== 'none') where.supplierId = supplierId;
  if (supplierId === 'none') where.supplierId = null;

  const items = await prisma.inventoryItem.findMany({
    where,
    include: { supplier: true },
    orderBy: { name: 'asc' },
  });

  const enriched = items
    .map(withReplenishmentFields)
    .filter((item) => {
      if (statusFilter) return item.status === statusFilter;
      return item.status !== 'HEALTHY';
    })
    .sort((a, b) => {
      const urgency = URGENCY[a.status as StockStatus] - URGENCY[b.status as StockStatus];
      if (urgency !== 0) return urgency;
      return a.name.localeCompare(b.name);
    })
    .map(serializeAlertItem);

  const groupMap = new Map<
    string,
    { supplierId: string | null; supplier: { id: string; name: string; phone: string } | null; items: typeof enriched }
  >();

  for (const item of enriched) {
    const key = item.supplierId || '__none__';
    if (!groupMap.has(key)) {
      groupMap.set(key, {
        supplierId: item.supplierId,
        supplier: item.supplier,
        items: [],
      });
    }
    groupMap.get(key)!.items.push(item);
  }

  const bySupplier = Array.from(groupMap.values()).sort((a, b) => {
    if (!a.supplier && b.supplier) return 1;
    if (a.supplier && !b.supplier) return -1;
    return (a.supplier?.name || 'Items without a supplier').localeCompare(
      b.supplier?.name || 'Items without a supplier'
    );
  });

  res.status(200).json({
    success: true,
    total: enriched.length,
    items: enriched,
    bySupplier,
  });
}

/** GET /api/replenishment/summary */
export async function getReplenishmentSummary(req: Request, res: Response) {
  const shopId = getShopId(req);

  const items = await prisma.inventoryItem.findMany({
    where: { shopId, isActive: true },
  });

  let outOfStockCount = 0;
  let lowStockCount = 0;
  let needsReorderCount = 0;
  let totalEstimatedCost = 0;

  for (const raw of items) {
    const item = withReplenishmentFields(raw);
    if (item.status === 'OUT_OF_STOCK') outOfStockCount++;
    else if (item.status === 'LOW_STOCK') lowStockCount++;
    else if (item.status === 'NEEDS_REORDER') needsReorderCount++;

    if (item.status !== 'HEALTHY') {
      totalEstimatedCost += item.estimatedCost;
    }
  }

  res.status(200).json({
    success: true,
    summary: {
      totalActive: items.length,
      outOfStockCount,
      lowStockCount,
      needsReorderCount,
      totalNeedingAttention: outOfStockCount + lowStockCount + needsReorderCount,
      alertCount: outOfStockCount + lowStockCount,
      totalEstimatedReorderCost: roundMoney(totalEstimatedCost),
    },
  });
}
