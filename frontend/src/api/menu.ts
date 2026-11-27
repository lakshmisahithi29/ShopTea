import { api } from './client';
import { MenuItem } from '../types';

export type MenuCategory = MenuItem['category'];

export interface MenuPayload {
  name: string;
  description?: string | null;
  category: MenuCategory;
  sellingPrice: number;
  isActive?: boolean;
  recipeItems: Array<{ itemId: string; quantity: number }>;
}

export interface MenuListParams {
  search?: string;
  category?: MenuCategory;
  activeOnly?: 'true' | 'false';
  page?: number;
  limit?: number;
}

export interface MenuListResult {
  success: boolean;
  menuItems: MenuItem[];
  pagination: { total: number; page: number; limit: number; totalPages: number };
}

export interface MenuMutationResult {
  success: boolean;
  message: string;
  menuItem: MenuItem;
}

export async function getMenuItems(params: MenuListParams = {}): Promise<MenuListResult> {
  const response = await api.get<MenuListResult>('/menu', { params });
  return response.data;
}

export async function getMenuItem(id: string): Promise<MenuItem> {
  const response = await api.get<{ success: boolean; menuItem: MenuItem }>(`/menu/${id}`);
  return response.data.menuItem;
}

export async function createMenuItem(payload: MenuPayload): Promise<MenuMutationResult> {
  const response = await api.post<MenuMutationResult>('/menu', payload);
  return response.data;
}

export async function updateMenuItem(id: string, payload: MenuPayload): Promise<MenuMutationResult> {
  const response = await api.patch<MenuMutationResult>(`/menu/${id}`, payload);
  return response.data;
}
