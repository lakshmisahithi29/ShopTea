import { z } from 'zod';
import { transactionDateSchema } from './transaction.validation';
import { itemUnitSchema } from './item.validation';

export const usageLineSchema = z.object({
  itemId: z.string().trim().min(1),
  quantity: z.number().positive('Quantity must be greater than zero').max(999_999_999.999),
  inputUnit: itemUnitSchema.optional(),
}).strict();

export const usageCreateSchema = z.object({
  items: z.array(usageLineSchema).min(1, 'Add at least one inventory item').max(100),
  reference: z.string().trim().max(100).optional().nullable(),
  notes: z.string().trim().max(500).optional().nullable(),
  date: transactionDateSchema,
  idempotencyKey: z.string().trim().min(8).max(100),
}).strict().refine((value) => new Set(value.items.map((item) => item.itemId)).size === value.items.length, {
  message: 'Each inventory item can appear only once in a usage record',
  path: ['items'],
});

export const usageCancelSchema = z.object({
  reason: z.string().trim().min(3).max(500),
  idempotencyKey: z.string().trim().min(8).max(100),
}).strict();

export const usageListQuerySchema = z.object({
  status: z.enum(['ACTIVE', 'CANCELLED']).optional(),
  itemId: z.string().trim().min(1).optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
}).strict();
