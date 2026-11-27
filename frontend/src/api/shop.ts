import { api } from './client';
import { Shop, ShopSettings, ShopType, User } from '../types';

export interface SetupShopPayload {
  name: string;
  ownerName: string;
  phone: string;
  address?: string;
  currency?: string;
  type?: ShopType;
  timezone?: string;
  settings?: ShopSettings;
}

export interface UpdateShopPayload {
  name?: string;
  ownerName?: string;
  phone?: string;
  address?: string;
  currency?: string;
  type?: ShopType;
  timezone?: string;
  settings?: ShopSettings;
}

export interface ShopResponse {
  success: boolean;
  message: string;
  shop: Shop;
  user?: User;
}

export async function setupShop(payload: SetupShopPayload): Promise<ShopResponse> {
  const res = await api.post<ShopResponse>('/shop', payload);
  return res.data;
}

export async function getShop(): Promise<Shop> {
  const res = await api.get<{ success: boolean; shop: Shop }>('/shop');
  return res.data.shop;
}

export async function updateShop(payload: UpdateShopPayload): Promise<ShopResponse> {
  const res = await api.patch<ShopResponse>('/shop', payload);
  return res.data;
}
