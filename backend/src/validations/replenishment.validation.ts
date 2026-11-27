import { z } from 'zod';

export const updateLevelsSchema = z
  .object({
    minStock: z.coerce.number().min(0, 'Minimum stock cannot be negative'),
    reorderLevel: z.coerce.number().min(0, 'Reorder level cannot be negative'),
    targetStock: z.coerce.number().min(0, 'Target stock cannot be negative'),
  })
  .refine((d) => d.minStock <= d.reorderLevel, {
    message: 'Minimum stock must be ≤ reorder level',
    path: ['minStock'],
  })
  .refine((d) => d.reorderLevel <= d.targetStock, {
    message: 'Reorder level must be ≤ target stock',
    path: ['reorderLevel'],
  });

const emptyToUndef = (value: unknown) => (value === '' || value === undefined ? undefined : value);

export const reorderListQuerySchema = z.object({
  supplierId: z.preprocess(emptyToUndef, z.string().optional()),
  category: z.preprocess(
    emptyToUndef,
    z.enum(['TEA_LEAVES', 'DAIRY', 'SPICES', 'SWEETENERS', 'PACKAGING', 'SNACKS', 'OTHER']).optional()
  ),
  status: z.preprocess(
    emptyToUndef,
    z.enum(['OUT_OF_STOCK', 'LOW_STOCK', 'NEEDS_REORDER', 'HEALTHY']).optional()
  ),
});
