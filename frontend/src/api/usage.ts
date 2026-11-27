import { api } from './client';
import { ItemUnit, StockUsage, TransactionStatus } from '../types';

export interface UsagePayload {
  items: Array<{ itemId: string; quantity: number; inputUnit?: ItemUnit }>;
  reference?: string | null;
  notes?: string | null;
  date?: string;
  idempotencyKey: string;
}

export interface UsageListParams {
  status?: TransactionStatus;
  itemId?: string;
  startDate?: string;
  endDate?: string;
  page?: number;
  limit?: number;
}

export interface UsageListResult {
  success: boolean;
  usageRecords: StockUsage[];
  pagination: { total: number; page: number; limit: number; totalPages: number };
  summary: { activeUsageCount: number; totalCost: number };
}

export interface UsageMutationResult {
  success: boolean;
  message: string;
  usage: StockUsage;
  reversals?: StockUsage['movements'];
  isDuplicate?: boolean;
}

export async function getUsageRecords(params: UsageListParams = {}): Promise<UsageListResult> {
  const response = await api.get<UsageListResult>('/usage-records', { params });
  return response.data;
}

export async function getUsageRecord(id: string): Promise<StockUsage> {
  const response = await api.get<{ success: boolean; usage: StockUsage }>(`/usage-records/${id}`);
  return response.data.usage;
}

export async function createUsageRecord(payload: UsagePayload): Promise<UsageMutationResult> {
  const response = await api.post<UsageMutationResult>('/usage-records', payload);
  return response.data;
}

export async function cancelUsageRecord(id: string, reason: string, idempotencyKey: string): Promise<UsageMutationResult> {
  const response = await api.post<UsageMutationResult>(`/usage-records/${id}/cancel`, { reason, idempotencyKey });
  return response.data;
}
