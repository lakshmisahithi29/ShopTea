import { z } from 'zod';
import { transactionDateSchema } from './transaction.validation';

export const saleItemSchema = z.object({
  menuItemId: z.string().trim().min(1),
  quantity: z.number().int().min(1).max(10_000),
}).strict();

export const saleCreateSchema = z.object({
  items: z.array(saleItemSchema).min(1, 'Add at least one sale item').max(100),
  reference: z.string().trim().max(100).optional().nullable(),
  notes: z.string().trim().max(500).optional().nullable(),
  date: transactionDateSchema,
  idempotencyKey: z.string().trim().min(8).max(100),
}).strict().refine((value) => new Set(value.items.map((item) => item.menuItemId)).size === value.items.length, {
  message: 'Each menu item can appear only once in a sale',
  path: ['items'],
});

export const saleCancelSchema = z.object({
  reason: z.string().trim().min(3).max(500),
  idempotencyKey: z.string().trim().min(8).max(100),
}).strict();

export const saleListQuerySchema = z.object({
  status: z.enum(['ACTIVE', 'CANCELLED']).optional(),
  menuItemId: z.string().trim().min(1).optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
}).strict();
