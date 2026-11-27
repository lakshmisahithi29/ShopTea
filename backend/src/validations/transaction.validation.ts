import { z } from 'zod';
import { isFutureTransactionDate, parseDateInput } from '../utils/dateRange';
import { itemUnitSchema } from './item.validation';

export const transactionDateSchema = z.string().optional().superRefine((value, ctx) => {
  if (value === undefined) return;
  if (Number.isNaN(parseDateInput(value).getTime())) {
    ctx.addIssue({ code: 'custom', message: 'Invalid transaction date' });
    return;
  }
  if (isFutureTransactionDate(value)) {
    ctx.addIssue({
      code: 'custom',
      message: 'Transaction date cannot be in the future',
    });
  }
});

export const purchaseTransactionSchema = z.object({
  itemId: z.string().min(1, 'Item ID is required'),
  quantity: z
    .number({ error: 'Quantity must be a valid number' })
    .positive('Quantity must be greater than zero'),
  unitCost: z
    .number({ error: 'Unit cost must be a valid number' })
    .positive('Unit cost must be greater than zero'),
  supplierId: z.string().optional().nullable(),
  reference: z.string().trim().optional().nullable(),
  remarks: z.string().trim().optional().nullable(),
  date: transactionDateSchema,
  idempotencyKey: z.string().trim().min(8, 'Idempotency key must be at least 8 characters').max(100),
  inputUnit: itemUnitSchema.optional(),
}).strict();

export const usageTransactionSchema = z.object({
  itemId: z.string().min(1, 'Item ID is required'),
  quantity: z
    .number({ error: 'Quantity must be a valid number' })
    .positive('Quantity must be greater than zero'),
  remarks: z.string().trim().optional().nullable(),
  date: transactionDateSchema,
  idempotencyKey: z.string().trim().optional(),
  inputUnit: itemUnitSchema.optional(),
});

export const wastageTransactionSchema = z.object({
  itemId: z.string().min(1, 'Item ID is required'),
  quantity: z
    .number({ error: 'Quantity must be a valid number' })
    .positive('Quantity must be greater than zero'),
  wastageReason: z.enum(['EXPIRED', 'SPOILED', 'DAMAGED', 'SPILLED', 'OTHER'], {
    error: () => 'Please select a valid wastage reason',
  }),
  remarks: z.string().trim().optional().nullable(),
  date: transactionDateSchema,
  idempotencyKey: z.string().trim().optional(),
  inputUnit: itemUnitSchema.optional(),
});

export const adjustmentTransactionSchema = z.object({
  itemId: z.string().min(1, 'Item ID is required'),
  quantity: z
    .number({ error: 'Quantity must be a valid number' })
    .positive('Quantity must be greater than zero'),
  adjustmentType: z.enum(['INCREASE', 'DECREASE'], {
    error: () => 'Adjustment type must be INCREASE or DECREASE',
  }),
  remarks: z.string().trim().min(3, 'Detailed remarks are required for audit adjustment'),
  date: transactionDateSchema,
  idempotencyKey: z.string().trim().optional(),
  inputUnit: itemUnitSchema.optional(),
});

export const transactionFilterSchema = z.object({
  type: z.enum(['PURCHASE', 'USAGE', 'WASTAGE', 'ADJUSTMENT', 'REVERSAL']).optional(),
  status: z.enum(['ACTIVE', 'CANCELLED']).optional(),
  itemId: z.string().optional(),
  supplierId: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  page: z.string().default('1').transform((val) => Math.max(1, parseInt(val, 10) || 1)),
  limit: z.string().default('15').transform((val) => Math.min(100, Math.max(1, parseInt(val, 10) || 15))),
});
