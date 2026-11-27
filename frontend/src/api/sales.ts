import { api } from './client';
import { Sale, TransactionStatus } from '../types';

export interface SalePayload {
  items: Array<{ menuItemId: string; quantity: number }>;
  reference?: string | null;
  notes?: string | null;
  date?: string;
  idempotencyKey: string;
}

export interface SaleListParams {
  status?: TransactionStatus;
  menuItemId?: string;
  startDate?: string;
  endDate?: string;
  page?: number;
  limit?: number;
}

export interface SaleListResult {
  success: boolean;
  sales: Sale[];
  pagination: { total: number; page: number; limit: number; totalPages: number };
  summary: { activeSaleCount: number; revenue: number; itemsSold: number };
}

export interface SaleMutationResult {
  success: boolean;
  message: string;
  sale: Sale;
  reversals?: Sale['movements'];
  isDuplicate?: boolean;
}

export async function getSales(params: SaleListParams = {}): Promise<SaleListResult> {
  const response = await api.get<SaleListResult>('/sales', { params });
  return response.data;
}

export async function getSale(id: string): Promise<Sale> {
  const response = await api.get<{ success: boolean; sale: Sale }>(`/sales/${id}`);
  return response.data.sale;
}

export async function createSale(payload: SalePayload): Promise<SaleMutationResult> {
  const response = await api.post<SaleMutationResult>('/sales', payload);
  return response.data;
}

export async function cancelSale(id: string, reason: string, idempotencyKey: string): Promise<SaleMutationResult> {
  const response = await api.post<SaleMutationResult>(`/sales/${id}/cancel`, { reason, idempotencyKey });
  return response.data;
}
