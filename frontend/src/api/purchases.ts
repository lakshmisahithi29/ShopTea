import { api } from './client';
import { InventoryItem, ItemUnit, Purchase } from '../types';

export interface PurchasePayload {
  itemId?: string;
  quantity: number;
  unitCost: number;
  inputUnit?: ItemUnit;
  supplierId?: string | null;
  reference?: string | null;
  remarks?: string | null;
  date?: string;
  idempotencyKey: string;
}

export interface PurchaseListParams {
  status?: 'ACTIVE' | 'CANCELLED';
  itemId?: string;
  supplierId?: string;
  startDate?: string;
  endDate?: string;
  page?: number;
  limit?: number;
}

export interface PurchaseMutationResult {
  success: boolean;
  message: string;
  purchase: Purchase;
  transaction?: Purchase;
  reversal?: Purchase | null;
  original?: Purchase;
  updatedItem?: InventoryItem;
  newStock?: number;
  isDuplicate?: boolean;
}

export interface PurchaseListResult {
  success: boolean;
  purchases: Purchase[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
  summary: {
    activePurchaseCount: number;
    activePurchaseValue: number;
    costMethod: 'WEIGHTED_AVERAGE';
  };
}

export async function getPurchases(params: PurchaseListParams = {}): Promise<PurchaseListResult> {
  const response = await api.get<PurchaseListResult>('/purchases', { params });
  return response.data;
}

export async function getPurchase(id: string): Promise<Purchase> {
  const response = await api.get<{ success: boolean; purchase: Purchase }>(`/purchases/${id}`);
  return response.data.purchase;
}

export async function createPurchase(payload: PurchasePayload): Promise<PurchaseMutationResult> {
  const response = await api.post<PurchaseMutationResult>('/purchases', payload);
  return response.data;
}

export async function updatePurchase(
  id: string,
  payload: Omit<PurchasePayload, 'itemId'>,
): Promise<PurchaseMutationResult> {
  const response = await api.patch<PurchaseMutationResult>(`/purchases/${id}`, payload);
  return response.data;
}

export async function cancelPurchase(
  id: string,
  reason: string,
  idempotencyKey: string,
): Promise<PurchaseMutationResult> {
  const response = await api.post<PurchaseMutationResult>(`/purchases/${id}/cancel`, {
    reason,
    idempotencyKey,
  });
  return response.data;
}
