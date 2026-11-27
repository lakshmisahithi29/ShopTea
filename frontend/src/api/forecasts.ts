import { api } from './client';
import type { ItemCategory, ItemUnit, TransactionType } from '../types';

export type ForecastDataQuality = 'GOOD' | 'LIMITED' | 'INSUFFICIENT';
export type ForecastTrend = 'INCREASING' | 'DECREASING' | 'STABLE' | 'INSUFFICIENT_DATA';

export interface ForecastParams {
  historyDays: number;
  forecastDays: number;
  windowDays: number;
  safetyBufferDays: number;
  itemId?: string;
}

export interface ForecastExactMetrics {
  asOf: string;
  inventoryItemCount: number;
  inventoryValue: number;
  salesCount: number;
  salesRevenue: number;
  purchaseCount: number;
  purchaseValue: number;
  consumptionMovementCount: number;
  consumptionValue: number;
  wastageValue: number;
  stockMovementTotals: Array<{ type: TransactionType; count: number; value: number }>;
}

export interface ItemPrediction {
  predictedConsumption: number;
  dailyForecast: Array<{ date: string; quantity: number }>;
  daysUntilStockOut: number | null;
  estimatedStockOutDate: string | null;
  safetyStock: number;
  reorderPoint: number;
  daysUntilReorder: number | null;
  suggestedReorderDate: string | null;
  desiredStock: number;
  suggestedPurchaseQty: number;
  estimatedPurchaseCost: number;
}

export interface ItemForecast {
  itemId: string;
  name: string;
  category: ItemCategory;
  unit: ItemUnit;
  supplier: { id: string; name: string } | null;
  currentStock: number;
  unitCost: number;
  currentStockValue: number;
  minStock: number;
  reorderLevel: number;
  targetStock: number;
  leadTimeDays: number;
  status: 'OUT_OF_STOCK' | 'LOW_STOCK' | 'NEEDS_REORDER' | 'HEALTHY';
  dataQuality: ForecastDataQuality;
  qualityMessage: string;
  daysWithUsage: number;
  historicalUsageQuantity: number;
  historicalAverageDailyConsumption: number;
  trend: ForecastTrend;
  trendPercentChange: number | null;
  history: { dates: string[]; quantities: number[] };
  prediction: ItemPrediction | null;
}

export interface SalesForecast {
  dataQuality: ForecastDataQuality;
  qualityMessage: string;
  daysWithSales: number;
  historicalRevenue: number;
  historicalAverageDailyRevenue: number;
  trend: ForecastTrend;
  trendPercentChange: number | null;
  history: Array<{ date: string; revenue: number; salesCount: number }>;
  prediction: null | {
    predictedRevenue: number;
    predictedSalesCount: number;
    dailyForecast: Array<{ date: string; revenue: number; salesCount: number }>;
  };
}

export interface Forecast {
  generatedAt: string;
  model: { name: string; version: number; description: string; disclaimer: string };
  parameters: ForecastParams;
  filter: { itemId: string | null };
  historyRange: { from: string; to: string; days: number };
  forecastRange: { from: string; to: string; days: number };
  exact: ForecastExactMetrics;
  dataQuality: ForecastDataQuality;
  dataQualityCounts: Record<ForecastDataQuality, number>;
  items: ItemForecast[];
  salesForecast: SalesForecast;
}

export async function getForecast(params: ForecastParams): Promise<Forecast> {
  const response = await api.get<{ success: boolean; forecast: Forecast }>('/forecasts', { params });
  return response.data.forecast;
}
