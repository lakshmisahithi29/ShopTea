import { z } from 'zod';
import { purchaseTransactionSchema } from './transaction.validation';

export const purchaseEditSchema = purchaseTransactionSchema.omit({ itemId: true });

export const purchaseCancelSchema = z.object({
  reason: z.string().trim().min(3, 'Cancellation reason must be at least 3 characters').max(500),
  idempotencyKey: z.string().trim().min(8).max(100),
}).strict();

export const purchaseListQuerySchema = z.object({
  status: z.enum(['ACTIVE', 'CANCELLED']).optional(),
  itemId: z.string().trim().min(1).optional(),
  supplierId: z.string().trim().min(1).optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
}).strict();
