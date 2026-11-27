export type ForecastTrend = 'INCREASING' | 'DECREASING' | 'STABLE' | 'INSUFFICIENT_DATA';
export type ForecastDataQuality = 'GOOD' | 'LIMITED' | 'INSUFFICIENT';

export function weightedMovingAverage(values: number[], windowSize: number): number {
  const sample = values.slice(-Math.max(1, windowSize));
  if (sample.length === 0) return 0;
  const weightedTotal = sample.reduce((sum, value, index) => sum + value * (index + 1), 0);
  const weightTotal = sample.reduce((sum, _value, index) => sum + index + 1, 0);
  return weightTotal === 0 ? 0 : weightedTotal / weightTotal;
}

export function average(values: number[]): number {
  return values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function classifyTrend(recentValues: number[], previousValues: number[], thresholdPercent = 10): {
  trend: ForecastTrend;
  percentChange: number | null;
} {
  if (recentValues.length === 0 || previousValues.length === 0) {
    return { trend: 'INSUFFICIENT_DATA', percentChange: null };
  }
  const recent = average(recentValues);
  const previous = average(previousValues);
  if (previous === 0) {
    return { trend: recent > 0 ? 'INCREASING' : 'STABLE', percentChange: null };
  }
  const percentChange = ((recent - previous) / Math.abs(previous)) * 100;
  const trend = percentChange > thresholdPercent
    ? 'INCREASING'
    : percentChange < -thresholdPercent
      ? 'DECREASING'
      : 'STABLE';
  return { trend, percentChange };
}

export function forecastDataQuality(daysWithActivity: number): ForecastDataQuality {
  if (daysWithActivity < 3) return 'INSUFFICIENT';
  if (daysWithActivity < 7) return 'LIMITED';
  return 'GOOD';
}

export function addCalendarDays(date: Date, days: number): Date {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

export function daysOfCover(currentStock: number, averageDailyUsage: number): number | null {
  if (averageDailyUsage <= 0) return null;
  return Math.max(0, currentStock) / averageDailyUsage;
}

export function calculateReorderRecommendation(input: {
  currentStock: number;
  minStock: number;
  targetStock: number;
  averageDailyUsage: number;
  leadTimeDays: number;
  forecastDays: number;
  safetyBufferDays: number;
  asOf: Date;
}) {
  const safetyStock = input.averageDailyUsage * input.safetyBufferDays;
  const leadTimeDemand = input.averageDailyUsage * input.leadTimeDays;
  const reorderPoint = Math.max(input.minStock, leadTimeDemand + safetyStock);
  const daysUntilReorder = input.averageDailyUsage > 0
    ? Math.max(0, (input.currentStock - reorderPoint) / input.averageDailyUsage)
    : null;
  const coverageDemand = input.averageDailyUsage * (
    input.leadTimeDays + input.forecastDays + input.safetyBufferDays
  );
  const desiredStock = Math.max(input.targetStock, coverageDemand);

  return {
    safetyStock,
    reorderPoint,
    daysUntilReorder,
    suggestedReorderDate: daysUntilReorder === null
      ? null
      : addCalendarDays(input.asOf, Math.floor(daysUntilReorder)),
    desiredStock,
    suggestedPurchaseQty: Math.max(0, desiredStock - input.currentStock),
  };
}
