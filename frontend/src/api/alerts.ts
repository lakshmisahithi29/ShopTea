import { api } from './client';
import type { StockAlert, StockAlertStatus, StockAlertSummary, StockAlertType } from '../types';

export interface AlertListParams {
  status?: StockAlertStatus;
  type?: StockAlertType;
  itemId?: string;
  page?: number;
  limit?: number;
}

export interface AlertListResult {
  alerts: StockAlert[];
  pagination: { total: number; page: number; limit: number; totalPages: number };
}

export async function listAlerts(params: AlertListParams = {}) {
  const response = await api.get<AlertListResult>('/alerts', { params });
  return response.data;
}

export async function getAlertSummary() {
  const response = await api.get<{ summary: StockAlertSummary }>('/alerts/summary');
  return response.data.summary;
}

export async function markAlertRead(id: string) {
  const response = await api.post<{ alert: StockAlert }>(`/alerts/${id}/read`);
  return response.data.alert;
}

export async function markAllAlertsRead() {
  const response = await api.post<{ updatedCount: number }>('/alerts/read-all');
  return response.data;
}
