import { api } from './client';
import type { ItemCategory, ItemUnit, TransactionStatus, TransactionType } from '../types';

export type ReportGranularity = 'day' | 'week' | 'month';
export type ReportExportType = 'sales' | 'purchases' | 'consumption' | 'inventory' | 'movements';

export interface ReportParams {
  from: string;
  to: string;
  itemId?: string;
  granularity: ReportGranularity;
}

export interface MetricComparison {
  change: number | null;
  percentChange: number | null;
}

export interface ReportSummary {
  salesCount: number;
  revenue: number;
  cogs: number;
  grossProfit: number | null;
  reliableCost: boolean;
  purchaseCount: number;
  purchaseValue: number;
  consumptionCount: number;
  consumptionValue: number;
  recipeConsumptionValue: number;
  manualConsumptionValue: number;
  inventoryValue: number;
  inventoryItemCount: number;
  costMethod: 'WEIGHTED_AVERAGE';
  grossProfitDefinition: string;
}

export interface ReportTrendPoint {
  date: string;
  revenue: number;
  cogs: number;
  grossProfit: number;
  purchaseValue: number;
  consumptionValue: number;
  recipeConsumptionValue: number;
  manualConsumptionValue: number;
  salesCount: number;
}

export interface ReportInventoryItem {
  itemId: string;
  name: string;
  category: ItemCategory;
  unit: ItemUnit;
  currentStock: number;
  unitCost: number;
  value: number;
  minStock: number;
  reorderLevel: number;
  targetStock: number;
  status: 'OUT_OF_STOCK' | 'LOW_STOCK' | 'NEEDS_REORDER' | 'HEALTHY';
  supplier: { id: string; name: string } | null;
}

export interface ReportSale {
  id: string;
  date: string;
  reference: string | null;
  total: number;
  items: Array<{
    menuItemId: string;
    name: string;
    quantity: number;
    unitPrice: number;
    total: number;
  }>;
}

export interface ReportPurchase {
  id: string;
  date: string;
  itemId: string;
  itemName: string;
  unit: ItemUnit | null;
  quantity: number;
  unitCost: number | null;
  totalCost: number | null;
  supplier: { id: string; name: string } | null;
  reference: string | null;
}

export interface ReportConsumptionItem {
  itemId: string;
  name: string;
  unit: ItemUnit;
  quantity: number;
  value: number;
  recipeQuantity: number;
  manualQuantity: number;
}

export interface ReportSalesItem {
  menuItemId: string;
  name: string;
  quantity: number;
  revenue: number;
}

export interface ReportMovement {
  id: string;
  date: string;
  type: TransactionType;
  status: TransactionStatus;
  itemId: string;
  itemName: string;
  unit: ItemUnit | null;
  quantity: number;
  unitCost: number | null;
  totalCost: number | null;
  reference: string | null;
  reversalOfId: string | null;
}

export interface Report {
  range: { from: string; to: string; days: number };
  previousRange: { from: string; to: string; days: number };
  granularity: ReportGranularity;
  filter: { itemId: string | null };
  summary: ReportSummary;
  comparison: {
    revenue: MetricComparison;
    cogs: MetricComparison;
    grossProfit: MetricComparison;
    purchaseValue: MetricComparison;
    consumptionValue: MetricComparison;
    salesCount: MetricComparison;
  };
  trend: ReportTrendPoint[];
  inventory: ReportInventoryItem[];
  sales: ReportSale[];
  purchases: ReportPurchase[];
  consumptionByItem: ReportConsumptionItem[];
  salesByItem: ReportSalesItem[];
  movements: ReportMovement[];
}

export async function getReport(params: ReportParams): Promise<Report> {
  const response = await api.get<{ success: boolean; report: Report }>('/reports/overview', { params });
  return response.data.report;
}

export async function downloadReportCsv(type: ReportExportType, params: ReportParams): Promise<Blob> {
  const response = await api.get<Blob>('/reports/export', {
    params: { ...params, type },
    responseType: 'blob',
  });
  return response.data;
}
