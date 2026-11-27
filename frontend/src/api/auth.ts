import { api } from './client';
import { User, Shop } from '../types';

export interface RegisterPayload {
  username: string;
  email: string;
  password: string;
}

export interface LoginPayload {
  identifier: string;
  password: string;
}

export interface AuthResponse {
  success: boolean;
  message: string;
  user?: User;
  shop?: Shop;
}

export async function registerUser(payload: RegisterPayload): Promise<AuthResponse> {
  const res = await api.post<AuthResponse>('/auth/register', payload);
  return res.data;
}

export async function loginUser(payload: LoginPayload): Promise<AuthResponse> {
  const res = await api.post<AuthResponse>('/auth/login', payload);
  return res.data;
}

export async function logoutUser(): Promise<AuthResponse> {
  const res = await api.post<AuthResponse>('/auth/logout');
  return res.data;
}

export async function getSessionUser(): Promise<{ success: boolean; user: User }> {
  const res = await api.get<{ success: boolean; user: User }>('/auth/me');
  return res.data;
}

export async function updateUserProfile(name: string): Promise<AuthResponse> {
  const res = await api.patch<AuthResponse>('/auth/profile', { name });
  return res.data;
}

