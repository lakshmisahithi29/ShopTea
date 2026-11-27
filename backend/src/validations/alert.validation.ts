import { z } from 'zod';

const emptyToUndefined = (value: unknown) => (value === '' || value === undefined ? undefined : value);

export const alertListQuerySchema = z
  .object({
    status: z.preprocess(emptyToUndefined, z.enum(['ACTIVE', 'RESOLVED']).optional()),
    type: z.preprocess(
      emptyToUndefined,
      z.enum(['OUT_OF_STOCK', 'LOW_STOCK', 'NEEDS_REORDER']).optional()
    ),
    itemId: z.preprocess(emptyToUndefined, z.string().uuid().optional()),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict();

export const alertIdParamSchema = z.object({ id: z.string().uuid() });
