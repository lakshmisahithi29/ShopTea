import { Prisma } from '@prisma/client';
import { prisma } from '../utils/prisma';
import { NotFoundError } from '../utils/errors';
import { isoDay, parseDashboardRange } from '../utils/dateRange';
import { roundMoney, roundQty, toNumber } from '../utils/numbers';
import { withReplenishmentFields } from './stockStatus';

export type ReportGranularity = 'day' | 'week' | 'month';
export type ReportExportType = 'sales' | 'purchases' | 'consumption' | 'inventory' | 'movements';

export interface ReportQuery {
  from?: string;
  to?: string;
  itemId?: string;
  granularity?: ReportGranularity;
}

function movementValue(tx: any): number {
  if (tx.totalCost !== null && tx.totalCost !== undefined) return toNumber(tx.totalCost);
  return toNumber(tx.quantity) * toNumber(tx.unitCost);
}

function startOfDay(date: Date): Date {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function addDays(date: Date, days: number): Date {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

function daysInclusive(from: Date, to: Date): number {
  return Math.round((startOfDay(to).getTime() - startOfDay(from).getTime()) / 86_400_000) + 1;
}

function bucketDate(date: Date, granularity: ReportGranularity): Date {
  const copy = startOfDay(date);
  if (granularity === 'week') {
    const offset = (copy.getDay() + 6) % 7;
    copy.setDate(copy.getDate() - offset);
  } else if (granularity === 'month') {
    copy.setDate(1);
  }
  return copy;
}

function bucketKey(date: Date, granularity: ReportGranularity): string {
  if (granularity === 'month') return isoDay(date).slice(0, 7);
  return isoDay(bucketDate(date, granularity));
}

function buildTrendBuckets(from: Date, to: Date, granularity: ReportGranularity) {
  const buckets = new Map<string, {
    date: string;
    revenue: number;
    cogs: number;
    grossProfit: number;
    purchaseValue: number;
    consumptionValue: number;
    recipeConsumptionValue: number;
    manualConsumptionValue: number;
    salesCount: number;
  }>();
  const cursor = bucketDate(from, granularity);
  const last = bucketDate(to, granularity);
  while (cursor <= last) {
    const key = bucketKey(cursor, granularity);
    buckets.set(key, {
      date: key,
      revenue: 0,
      cogs: 0,
      grossProfit: 0,
      purchaseValue: 0,
      consumptionValue: 0,
      recipeConsumptionValue: 0,
      manualConsumptionValue: 0,
      salesCount: 0,
    });
    if (granularity === 'month') cursor.setMonth(cursor.getMonth() + 1);
    else cursor.setDate(cursor.getDate() + (granularity === 'week' ? 7 : 1));
  }
  return buckets;
}

async function loadPeriodMetrics(shopId: string, from: Date, to: Date, itemId?: string) {
  const dateRange = { gte: from, lte: to };
  const saleWhere: Prisma.SaleWhereInput = {
    shopId,
    status: 'ACTIVE',
    date: dateRange,
    ...(itemId ? { movements: { some: { itemId } } } : {}),
  };
  const transactionWhere: Prisma.StockTransactionWhereInput = {
    shopId,
    status: 'ACTIVE',
    date: dateRange,
    ...(itemId ? { itemId } : {}),
  };
  const [sales, purchases, consumption] = await Promise.all([
    prisma.sale.findMany({
      where: saleWhere,
      include: { items: true, movements: true },
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
    }),
    prisma.stockTransaction.findMany({
      where: { ...transactionWhere, type: 'PURCHASE' },
      include: { item: true, supplier: true },
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
    }),
    prisma.stockTransaction.findMany({
      where: { ...transactionWhere, type: 'USAGE' },
      include: { item: true },
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
    }),
  ]);

  const revenue = roundMoney(sales.reduce((sum, sale) => sum + toNumber(sale.total), 0));
  const saleMovements = sales.flatMap((sale) => sale.movements.filter((movement) =>
    movement.type === 'USAGE' && movement.status === 'ACTIVE' && (!itemId || movement.itemId === itemId)
  ));
  const cogs = roundMoney(saleMovements.reduce((sum, movement) => sum + movementValue(movement), 0));
  const reliableCost = sales.every((sale) => {
    const movements = sale.movements.filter((movement) =>
      movement.type === 'USAGE' && movement.status === 'ACTIVE' && (!itemId || movement.itemId === itemId)
    );
    return movements.length > 0 && movements.every((movement) => movement.totalCost !== null);
  });
  const purchaseValue = roundMoney(purchases.reduce((sum, purchase) => sum + movementValue(purchase), 0));
  const consumptionValue = roundMoney(consumption.reduce((sum, movement) => sum + movementValue(movement), 0));
  const recipeConsumptionValue = roundMoney(consumption.filter((movement) => movement.saleId).reduce((sum, movement) => sum + movementValue(movement), 0));
  const manualConsumptionValue = roundMoney(consumption.filter((movement) => !movement.saleId).reduce((sum, movement) => sum + movementValue(movement), 0));

  return {
    sales,
    purchases,
    consumption,
    summary: {
      salesCount: sales.length,
      revenue,
      cogs,
      grossProfit: reliableCost ? roundMoney(revenue - cogs) : null,
      reliableCost,
      purchaseCount: purchases.length,
      purchaseValue,
      consumptionCount: consumption.length,
      consumptionValue,
      recipeConsumptionValue,
      manualConsumptionValue,
    },
  };
}

function metricSnapshot(metrics: Awaited<ReturnType<typeof loadPeriodMetrics>>) {
  const { salesCount, revenue, cogs, grossProfit, purchaseCount, purchaseValue, consumptionCount, consumptionValue } = metrics.summary;
  return { salesCount, revenue, cogs, grossProfit, purchaseCount, purchaseValue, consumptionCount, consumptionValue };
}

function comparisonValue(current: number | null, previous: number | null) {
  if (current === null || previous === null) return { change: null, percentChange: null };
  const change = roundMoney(current - previous);
  const percentChange = previous === 0 ? null : roundMoney((change / Math.abs(previous)) * 100);
  return { change, percentChange };
}

function buildComparison(current: ReturnType<typeof metricSnapshot>, previous: ReturnType<typeof metricSnapshot>) {
  return {
    revenue: comparisonValue(current.revenue, previous.revenue),
    cogs: comparisonValue(current.cogs, previous.cogs),
    grossProfit: comparisonValue(current.grossProfit, previous.grossProfit),
    purchaseValue: comparisonValue(current.purchaseValue, previous.purchaseValue),
    consumptionValue: comparisonValue(current.consumptionValue, previous.consumptionValue),
    salesCount: comparisonValue(current.salesCount, previous.salesCount),
  };
}

function serializeSale(sale: any) {
  return {
    id: sale.id,
    date: sale.date,
    reference: sale.reference,
    total: toNumber(sale.total),
    items: sale.items.map((item: any) => ({
      menuItemId: item.menuItemId,
      name: item.name,
      quantity: item.quantity,
      unitPrice: toNumber(item.unitPrice),
      total: toNumber(item.total),
    })),
  };
}

function serializePurchase(purchase: any) {
  return {
    id: purchase.id,
    date: purchase.date,
    itemId: purchase.itemId,
    itemName: purchase.item?.name || 'Unknown item',
    unit: purchase.item?.unit || null,
    quantity: toNumber(purchase.quantity),
    unitCost: purchase.unitCost === null ? null : toNumber(purchase.unitCost),
    totalCost: purchase.totalCost === null ? null : toNumber(purchase.totalCost),
    supplier: purchase.supplier ? { id: purchase.supplier.id, name: purchase.supplier.name } : null,
    reference: purchase.reference,
  };
}

function serializeMovement(movement: any) {
  return {
    id: movement.id,
    date: movement.date,
    type: movement.type,
    status: movement.status,
    itemId: movement.itemId,
    itemName: movement.item?.name || 'Unknown item',
    unit: movement.item?.unit || null,
    quantity: toNumber(movement.quantity),
    unitCost: movement.unitCost === null ? null : toNumber(movement.unitCost),
    totalCost: movement.totalCost === null ? null : toNumber(movement.totalCost),
    reference: movement.reference,
    reversalOfId: movement.reversalOfId,
  };
}

export async function buildReport(shopId: string, query: ReportQuery) {
  const { from, to } = parseDashboardRange(query.from, query.to);
  const granularity = query.granularity || 'day';
  if (query.itemId) {
    const item = await prisma.inventoryItem.findFirst({ where: { id: query.itemId, shopId } });
    if (!item) throw new NotFoundError('Inventory item not found in your shop.');
  }

  const periodDays = daysInclusive(from, to);
  const previousTo = new Date(from.getTime() - 1);
  const previousFrom = addDays(from, -periodDays);
  const [current, previous, items, movements] = await Promise.all([
    loadPeriodMetrics(shopId, from, to, query.itemId),
    loadPeriodMetrics(shopId, previousFrom, previousTo, query.itemId),
    prisma.inventoryItem.findMany({
      where: { shopId, isActive: true, ...(query.itemId ? { id: query.itemId } : {}) },
      include: { supplier: true },
      orderBy: { name: 'asc' },
    }),
    prisma.stockTransaction.findMany({
      where: { shopId, date: { gte: from, lte: to }, ...(query.itemId ? { itemId: query.itemId } : {}) },
      include: { item: true, supplier: true, reversalOf: true },
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
      take: 500,
    }),
  ]);

  const buckets = buildTrendBuckets(from, to, granularity);
  for (const sale of current.sales) {
    const bucket = buckets.get(bucketKey(sale.date, granularity));
    if (!bucket) continue;
    bucket.revenue = roundMoney(bucket.revenue + toNumber(sale.total));
    bucket.salesCount += 1;
    const saleCogs = sale.movements
      .filter((movement) => movement.type === 'USAGE' && movement.status === 'ACTIVE' && (!query.itemId || movement.itemId === query.itemId))
      .reduce((sum, movement) => sum + movementValue(movement), 0);
    bucket.cogs = roundMoney(bucket.cogs + saleCogs);
    bucket.grossProfit = roundMoney(bucket.revenue - bucket.cogs);
  }
  for (const purchase of current.purchases) {
    const bucket = buckets.get(bucketKey(purchase.date, granularity));
    if (bucket) bucket.purchaseValue = roundMoney(bucket.purchaseValue + movementValue(purchase));
  }
  for (const movement of current.consumption) {
    const bucket = buckets.get(bucketKey(movement.date, granularity));
    if (!bucket) continue;
    const value = movementValue(movement);
    bucket.consumptionValue = roundMoney(bucket.consumptionValue + value);
    if (movement.saleId) bucket.recipeConsumptionValue = roundMoney(bucket.recipeConsumptionValue + value);
    else bucket.manualConsumptionValue = roundMoney(bucket.manualConsumptionValue + value);
  }

  const inventory = items.map(withReplenishmentFields).map((item) => ({
    itemId: item.id,
    name: item.name,
    category: item.category,
    unit: item.unit,
    currentStock: item.currentStock,
    unitCost: item.unitCost,
    value: roundMoney(item.currentStock * item.unitCost),
    minStock: item.minStock,
    reorderLevel: item.reorderLevel,
    targetStock: item.targetStock,
    status: item.status,
    supplier: item.supplier ? { id: item.supplier.id, name: item.supplier.name } : null,
  }));
  const inventoryValue = roundMoney(inventory.reduce((sum, item) => sum + item.value, 0));

  const consumptionByItemMap = new Map<string, any>();
  for (const movement of current.consumption) {
    const key = movement.itemId;
    if (!consumptionByItemMap.has(key)) {
      consumptionByItemMap.set(key, {
        itemId: key,
        name: movement.item?.name || 'Unknown item',
        unit: movement.item?.unit || 'UNKNOWN',
        quantity: 0,
        value: 0,
        recipeQuantity: 0,
        manualQuantity: 0,
      });
    }
    const row = consumptionByItemMap.get(key);
    const quantity = toNumber(movement.quantity);
    row.quantity = roundQty(row.quantity + quantity);
    row.value = roundMoney(row.value + movementValue(movement));
    if (movement.saleId) row.recipeQuantity = roundQty(row.recipeQuantity + quantity);
    else row.manualQuantity = roundQty(row.manualQuantity + quantity);
  }

  const salesByItemMap = new Map<string, any>();
  for (const sale of current.sales) {
    for (const item of sale.items) {
      if (!salesByItemMap.has(item.menuItemId)) {
        salesByItemMap.set(item.menuItemId, { menuItemId: item.menuItemId, name: item.name, quantity: 0, revenue: 0 });
      }
      const row = salesByItemMap.get(item.menuItemId);
      row.quantity += item.quantity;
      row.revenue = roundMoney(row.revenue + toNumber(item.total));
    }
  }

  return {
    range: { from: isoDay(from), to: isoDay(to), days: periodDays },
    previousRange: { from: isoDay(previousFrom), to: isoDay(previousTo), days: periodDays },
    granularity,
    filter: { itemId: query.itemId || null },
    summary: {
      ...current.summary,
      inventoryValue,
      inventoryItemCount: inventory.length,
      costMethod: 'WEIGHTED_AVERAGE',
      grossProfitDefinition: 'Recorded active sales revenue minus recorded active sale-recipe COGS.',
    },
    comparison: buildComparison(metricSnapshot(current), metricSnapshot(previous)),
    trend: Array.from(buckets.values()),
    inventory,
    sales: current.sales.slice(0, 200).map(serializeSale),
    purchases: current.purchases.slice(0, 200).map(serializePurchase),
    consumptionByItem: Array.from(consumptionByItemMap.values()).sort((a, b) => b.value - a.value),
    salesByItem: Array.from(salesByItemMap.values()).sort((a, b) => b.revenue - a.revenue),
    movements: movements.map(serializeMovement),
  };
}

function csvCell(value: unknown): string {
  let text = value === null || value === undefined ? '' : String(value);
  if (/^[=+@-]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

function csv(rows: Array<Array<unknown>>): string {
  return rows.map((row) => row.map(csvCell).join(',')).join('\r\n');
}

export function reportToCsv(type: ReportExportType, report: Awaited<ReturnType<typeof buildReport>>): string {
  if (type === 'sales') {
    return csv([
      ['Date', 'Sale ID', 'Reference', 'Menu item', 'Quantity', 'Unit price', 'Line total'],
      ...report.sales.flatMap((sale) => sale.items.map((item: any) => [isoDay(sale.date), sale.id, sale.reference, item.name, item.quantity, item.unitPrice, item.total])),
    ]);
  }
  if (type === 'purchases') {
    return csv([
      ['Date', 'Purchase ID', 'Item', 'Quantity', 'Unit', 'Unit cost', 'Total cost', 'Supplier', 'Reference'],
      ...report.purchases.map((purchase) => [isoDay(purchase.date), purchase.id, purchase.itemName, purchase.quantity, purchase.unit, purchase.unitCost, purchase.totalCost, purchase.supplier?.name, purchase.reference]),
    ]);
  }
  if (type === 'consumption') {
    return csv([
      ['Item ID', 'Item', 'Unit', 'Total quantity', 'Recipe quantity', 'Manual quantity', 'Recorded cost'],
      ...report.consumptionByItem.map((item) => [item.itemId, item.name, item.unit, item.quantity, item.recipeQuantity, item.manualQuantity, item.value]),
    ]);
  }
  if (type === 'inventory') {
    return csv([
      ['Item ID', 'Item', 'Category', 'Unit', 'Current stock', 'Unit cost', 'Inventory value', 'Minimum', 'Reorder', 'Target', 'Status', 'Supplier'],
      ...report.inventory.map((item) => [item.itemId, item.name, item.category, item.unit, item.currentStock, item.unitCost, item.value, item.minStock, item.reorderLevel, item.targetStock, item.status, item.supplier?.name]),
    ]);
  }
  return csv([
    ['Date', 'Movement ID', 'Type', 'Status', 'Item', 'Quantity', 'Unit', 'Unit cost', 'Total cost', 'Reference', 'Reversal of'],
    ...report.movements.map((movement) => [isoDay(movement.date), movement.id, movement.type, movement.status, movement.itemName, movement.quantity, movement.unit, movement.unitCost, movement.totalCost, movement.reference, movement.reversalOfId]),
  ]);
}
