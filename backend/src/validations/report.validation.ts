import { z } from 'zod';

const emptyToUndefined = (value: unknown) => (value === '' || value === undefined ? undefined : value);
const dateInput = z.preprocess(
  emptyToUndefined,
  z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD').optional(),
);

export const reportQuerySchema = z
  .object({
    from: dateInput,
    to: dateInput,
    itemId: z.preprocess(emptyToUndefined, z.string().uuid().optional()),
    granularity: z.enum(['day', 'week', 'month']).default('day'),
  })
  .strict();

export const reportExportQuerySchema = reportQuerySchema.extend({
  type: z.enum(['sales', 'purchases', 'consumption', 'inventory', 'movements']).default('sales'),
});
