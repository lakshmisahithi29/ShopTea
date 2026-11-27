import { Prisma, TransactionType } from '@prisma/client';
import { prisma } from '../utils/prisma';
import { NotFoundError } from '../utils/errors';
import { eachDayInclusive, isoDay, parseDashboardRange } from '../utils/dateRange';
import { roundMoney, roundQty, toNumber } from '../utils/numbers';
import { withReplenishmentFields } from './stockStatus';
import {
  addCalendarDays,
  calculateReorderRecommendation,
  classifyTrend,
  daysOfCover,
  ForecastDataQuality,
  forecastDataQuality,
  weightedMovingAverage,
} from './forecastMath';

export interface ForecastQuery {
  historyDays?: number;
  forecastDays?: number;
  windowDays?: number;
  safetyBufferDays?: number;
  itemId?: string;
}

function movementValue(movement: {
  totalCost: unknown;
  quantity: unknown;
  unitCost: unknown;
  item?: { unitCost: unknown } | null;
}): number {
  if (movement.totalCost !== null && movement.totalCost !== undefined) return toNumber(movement.totalCost);
  const unitCost = movement.unitCost ?? movement.item?.unitCost ?? 0;
  return toNumber(movement.quantity) * toNumber(unitCost);
}

function roundedPercent(value: number | null): number | null {
  return value === null ? null : Number(value.toFixed(1));
}

function allocateQuantity(total: number, count: number, from: Date) {
  const rows = Array.from({ length: count }, (_, index) => ({
    date: isoDay(addCalendarDays(from, index + 1)),
    quantity: 0,
  }));
  let allocated = 0;
  for (let index = 0; index < rows.length; index += 1) {
    const quantity = index === rows.length - 1
      ? roundQty(total - allocated)
      : roundQty(total / rows.length);
    rows[index].quantity = quantity;
    allocated = roundQty(allocated + quantity);
  }
  return rows;
}

function allocateMoney(total: number, count: number, from: Date) {
  const rows = Array.from({ length: count }, (_, index) => ({
    date: isoDay(addCalendarDays(from, index + 1)),
    revenue: 0,
  }));
  let allocated = 0;
  for (let index = 0; index < rows.length; index += 1) {
    const revenue = index === rows.length - 1
      ? roundMoney(total - allocated)
      : roundMoney(total / rows.length);
    rows[index].revenue = revenue;
    allocated = roundMoney(allocated + revenue);
  }
  return rows;
}

function qualityMessage(quality: ForecastDataQuality): string {
  if (quality === 'INSUFFICIENT') return 'At least three days with recorded activity are required before a prediction is shown.';
  if (quality === 'LIMITED') return 'Limited activity is available. Treat this statistical estimate with caution.';
  return 'Based on recorded activity using a weighted moving average. This is an estimate, not a guarantee.';
}

export async function buildForecast(shopId: string, query: ForecastQuery) {
  const historyDays = query.historyDays ?? 30;
  const forecastDays = query.forecastDays ?? 7;
  const windowDays = query.windowDays ?? 7;
  const safetyBufferDays = query.safetyBufferDays ?? 2;
  const asOf = new Date();
  asOf.setHours(0, 0, 0, 0);
  const historyFrom = addCalendarDays(asOf, -(historyDays - 1));
  const { from, to } = parseDashboardRange(isoDay(historyFrom), isoDay(asOf));
  const days = eachDayInclusive(from, to);

  if (query.itemId) {
    const item = await prisma.inventoryItem.findFirst({ where: { id: query.itemId, shopId } });
    if (!item) throw new NotFoundError('Inventory item not found in your shop.');
  }

  const dateRange = { gte: from, lte: to };
  const saleWhere: Prisma.SaleWhereInput = {
    shopId,
    status: 'ACTIVE',
    date: dateRange,
    ...(query.itemId ? { movements: { some: { itemId: query.itemId, status: 'ACTIVE' } } } : {}),
  };
  const transactionWhere: Prisma.StockTransactionWhereInput = {
    shopId,
    status: 'ACTIVE',
    date: dateRange,
    ...(query.itemId ? { itemId: query.itemId } : {}),
  };

  const [rawItems, sales, transactions] = await Promise.all([
    prisma.inventoryItem.findMany({
      where: { shopId, isActive: true, ...(query.itemId ? { id: query.itemId } : {}) },
      include: { supplier: true },
      orderBy: { name: 'asc' },
    }),
    prisma.sale.findMany({
      where: saleWhere,
      include: { items: true },
      orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
    }),
    prisma.stockTransaction.findMany({
      where: transactionWhere,
      include: { item: true },
      orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
    }),
  ]);

  const items = rawItems.map(withReplenishmentFields);
  const salesByDay = new Map(days.map((date) => [date, { revenue: 0, salesCount: 0 }]));
  const usageByItem = new Map(items.map((item) => [item.id, new Map(days.map((date) => [date, 0]))]));
  const movementTotals = new Map<TransactionType, { type: TransactionType; count: number; value: number }>();

  for (const sale of sales) {
    const row = salesByDay.get(isoDay(sale.date));
    if (!row) continue;
    row.revenue = roundMoney(row.revenue + toNumber(sale.total));
    row.salesCount += 1;
  }

  for (const movement of transactions) {
    const value = movementValue(movement);
    const total = movementTotals.get(movement.type) || { type: movement.type, count: 0, value: 0 };
    total.count += 1;
    total.value = roundMoney(total.value + (movement.type === 'REVERSAL' ? -value : value));
    movementTotals.set(movement.type, total);

    if (movement.type === 'USAGE') {
      const daily = usageByItem.get(movement.itemId);
      const date = isoDay(movement.date);
      if (daily && daily.has(date)) daily.set(date, roundQty((daily.get(date) || 0) + toNumber(movement.quantity)));
    }
  }

  const itemForecasts = items.map((item) => {
    const dailyMap = usageByItem.get(item.id)!;
    const quantities = days.map((date) => dailyMap.get(date) || 0);
    const daysWithUsage = quantities.filter((quantity) => quantity > 0).length;
    const dataQuality = forecastDataQuality(daysWithUsage);
    const averageDailyConsumption = weightedMovingAverage(quantities, windowDays);
    const recent = quantities.slice(-windowDays);
    const previous = quantities.slice(-(windowDays * 2), -windowDays);
    const trend = classifyTrend(recent, previous);
    const predictionAvailable = dataQuality !== 'INSUFFICIENT';

    if (!predictionAvailable) {
      return {
        itemId: item.id,
        name: item.name,
        category: item.category,
        unit: item.unit,
        supplier: item.supplier ? { id: item.supplier.id, name: item.supplier.name } : null,
        currentStock: item.currentStock,
        unitCost: item.unitCost,
        currentStockValue: roundMoney(item.currentStock * item.unitCost),
        minStock: item.minStock,
        reorderLevel: item.reorderLevel,
        targetStock: item.targetStock,
        leadTimeDays: item.leadTimeDays,
        status: item.status,
        dataQuality,
        qualityMessage: qualityMessage(dataQuality),
        daysWithUsage,
        historicalUsageQuantity: roundQty(quantities.reduce((sum, quantity) => sum + quantity, 0)),
        historicalAverageDailyConsumption: roundQty(averageDailyConsumption),
        trend: trend.trend,
        trendPercentChange: roundedPercent(trend.percentChange),
        history: { dates: days, quantities },
        prediction: null,
      };
    }

    const coverDays = daysOfCover(item.currentStock, averageDailyConsumption);
    const reorder = calculateReorderRecommendation({
      currentStock: item.currentStock,
      minStock: item.minStock,
      targetStock: item.targetStock,
      averageDailyUsage: averageDailyConsumption,
      leadTimeDays: item.leadTimeDays,
      forecastDays,
      safetyBufferDays,
      asOf,
    });
    const predictedConsumption = roundQty(averageDailyConsumption * forecastDays);

    return {
      itemId: item.id,
      name: item.name,
      category: item.category,
      unit: item.unit,
      supplier: item.supplier ? { id: item.supplier.id, name: item.supplier.name } : null,
      currentStock: item.currentStock,
      unitCost: item.unitCost,
      currentStockValue: roundMoney(item.currentStock * item.unitCost),
      minStock: item.minStock,
      reorderLevel: item.reorderLevel,
      targetStock: item.targetStock,
      leadTimeDays: item.leadTimeDays,
      status: item.status,
      dataQuality,
      qualityMessage: qualityMessage(dataQuality),
      daysWithUsage,
      historicalUsageQuantity: roundQty(quantities.reduce((sum, quantity) => sum + quantity, 0)),
      historicalAverageDailyConsumption: roundQty(averageDailyConsumption),
      trend: trend.trend,
      trendPercentChange: roundedPercent(trend.percentChange),
      history: { dates: days, quantities },
      prediction: {
        predictedConsumption,
        dailyForecast: allocateQuantity(predictedConsumption, forecastDays, asOf),
        daysUntilStockOut: coverDays === null ? null : roundQty(coverDays),
        estimatedStockOutDate: coverDays === null ? null : isoDay(addCalendarDays(asOf, Math.ceil(coverDays))),
        safetyStock: roundQty(reorder.safetyStock),
        reorderPoint: roundQty(reorder.reorderPoint),
        daysUntilReorder: reorder.daysUntilReorder === null ? null : roundQty(reorder.daysUntilReorder),
        suggestedReorderDate: reorder.suggestedReorderDate ? isoDay(reorder.suggestedReorderDate) : null,
        desiredStock: roundQty(reorder.desiredStock),
        suggestedPurchaseQty: roundQty(reorder.suggestedPurchaseQty),
        estimatedPurchaseCost: roundMoney(reorder.suggestedPurchaseQty * item.unitCost),
      },
    };
  });

  const salesHistory = days.map((date) => ({ date, ...(salesByDay.get(date) || { revenue: 0, salesCount: 0 }) }));
  const revenueValues = salesHistory.map((row) => row.revenue);
  const salesCountValues = salesHistory.map((row) => row.salesCount);
  const daysWithSales = salesHistory.filter((row) => row.salesCount > 0).length;
  const salesQuality = forecastDataQuality(daysWithSales);
  const averageDailyRevenue = weightedMovingAverage(revenueValues, windowDays);
  const averageDailySalesCount = weightedMovingAverage(salesCountValues, windowDays);
  const salesTrend = classifyTrend(revenueValues.slice(-windowDays), revenueValues.slice(-(windowDays * 2), -windowDays));
  const predictedRevenue = roundMoney(averageDailyRevenue * forecastDays);
  const predictedSalesCount = roundQty(averageDailySalesCount * forecastDays);
  const salesCountForecast = allocateQuantity(predictedSalesCount, forecastDays, asOf);

  const purchaseValue = roundMoney(transactions
    .filter((movement) => movement.type === 'PURCHASE')
    .reduce((sum, movement) => sum + movementValue(movement), 0));
  const consumptionValue = roundMoney(transactions
    .filter((movement) => movement.type === 'USAGE')
    .reduce((sum, movement) => sum + movementValue(movement), 0));
  const wastageValue = roundMoney(transactions
    .filter((movement) => movement.type === 'WASTAGE')
    .reduce((sum, movement) => sum + movementValue(movement), 0));
  const qualityCounts = itemForecasts.reduce<Record<ForecastDataQuality, number>>(
    (counts, item) => ({ ...counts, [item.dataQuality]: counts[item.dataQuality] + 1 }),
    { GOOD: 0, LIMITED: 0, INSUFFICIENT: 0 },
  );
  const overallQuality: ForecastDataQuality = qualityCounts.INSUFFICIENT > 0
    ? 'INSUFFICIENT'
    : qualityCounts.LIMITED > 0
      ? 'LIMITED'
      : qualityCounts.GOOD > 0
        ? 'GOOD'
        : 'INSUFFICIENT';

  return {
    generatedAt: new Date().toISOString(),
    model: {
      name: 'WEIGHTED_MOVING_AVERAGE',
      version: 1,
      description: 'Recent days receive higher weights. Zero-activity days remain in the historical series.',
      disclaimer: 'Statistical estimates only. Actual stock and financial values come directly from recorded database transactions.',
    },
    parameters: { historyDays, forecastDays, windowDays, safetyBufferDays },
    filter: { itemId: query.itemId || null },
    historyRange: { from: isoDay(from), to: isoDay(to), days: days.length },
    forecastRange: {
      from: isoDay(addCalendarDays(asOf, 1)),
      to: isoDay(addCalendarDays(asOf, forecastDays)),
      days: forecastDays,
    },
    exact: {
      asOf: new Date().toISOString(),
      inventoryItemCount: items.length,
      inventoryValue: roundMoney(items.reduce((sum, item) => sum + item.currentStock * item.unitCost, 0)),
      salesCount: sales.length,
      salesRevenue: roundMoney(sales.reduce((sum, sale) => sum + toNumber(sale.total), 0)),
      purchaseCount: transactions.filter((movement) => movement.type === 'PURCHASE').length,
      purchaseValue,
      consumptionMovementCount: transactions.filter((movement) => movement.type === 'USAGE').length,
      consumptionValue,
      wastageValue,
      stockMovementTotals: Array.from(movementTotals.values()).sort((a, b) => a.type.localeCompare(b.type)),
    },
    dataQuality: overallQuality,
    dataQualityCounts: qualityCounts,
    items: itemForecasts,
    salesForecast: {
      dataQuality: salesQuality,
      qualityMessage: qualityMessage(salesQuality),
      daysWithSales,
      historicalRevenue: roundMoney(revenueValues.reduce((sum, value) => sum + value, 0)),
      historicalAverageDailyRevenue: roundMoney(averageDailyRevenue),
      trend: salesTrend.trend,
      trendPercentChange: roundedPercent(salesTrend.percentChange),
      history: salesHistory,
      prediction: salesQuality === 'INSUFFICIENT' ? null : {
        predictedRevenue,
        predictedSalesCount,
        dailyForecast: allocateMoney(predictedRevenue, forecastDays, asOf).map((row, index) => ({
          ...row,
          salesCount: salesCountForecast[index].quantity,
        })),
      },
    },
  };
}
