import { z } from 'zod';
import { areUnitsCompatible } from '../utils/units';

export const itemCategorySchema = z.enum([
  'TEA_LEAVES',
  'DAIRY',
  'SPICES',
  'SWEETENERS',
  'PACKAGING',
  'SNACKS',
  'OTHER',
]);

export const itemUnitSchema = z.enum(['KG', 'G', 'LITRES', 'ML', 'PACKETS', 'PIECES']);

const quantitySchema = z.coerce
  .number()
  .finite('Stock values must be finite')
  .min(0, 'Stock values cannot be negative')
  .max(999_999_999.999, 'Stock value exceeds the supported precision');

const moneySchema = z.coerce
  .number()
  .finite('Unit cost must be finite')
  .min(0, 'Unit cost cannot be negative')
  .max(9_999_999_999.99, 'Unit cost exceeds the supported precision');

const supplierIdSchema = z.string().trim().min(1).nullable().optional();
const descriptionSchema = z.string().trim().max(1000, 'Description cannot exceed 1000 characters').nullable().optional();
const leadTimeDaysSchema = z.coerce.number().int().min(0).max(3650).default(0);

export const createItemSchema = z
  .object({
    name: z.string().trim().min(2, 'Item name must be at least 2 characters').max(100),
    description: descriptionSchema,
    category: itemCategorySchema,
    unit: itemUnitSchema,
    inputUnit: itemUnitSchema.optional(),
    leadTimeDays: leadTimeDaysSchema,
    openingStock: quantitySchema.default(0),
    unitCost: moneySchema.default(0),
    minStock: quantitySchema.default(0),
    reorderLevel: quantitySchema.default(0),
    targetStock: quantitySchema.default(0),
    supplierId: supplierIdSchema,
  })
  .strict()
  .superRefine((data, ctx) => {
    if (data.inputUnit && !areUnitsCompatible(data.inputUnit, data.unit)) {
      ctx.addIssue({
        code: 'custom',
        message: 'Input unit must use the same measurement family as the inventory unit',
        path: ['inputUnit'],
      });
    }
    if (data.minStock > data.reorderLevel) {
      ctx.addIssue({
        code: 'custom',
        message: 'Minimum stock must be ≤ reorder level',
        path: ['minStock'],
      });
    }
    if (data.reorderLevel > data.targetStock) {
      ctx.addIssue({
        code: 'custom',
        message: 'Reorder level must be ≤ target stock',
        path: ['reorderLevel'],
      });
    }
    if (data.unit === 'PIECES' || data.unit === 'PACKETS') {
      for (const field of ['openingStock', 'minStock', 'reorderLevel', 'targetStock'] as const) {
        if (!Number.isInteger(data[field])) {
          ctx.addIssue({
            code: 'custom',
            message: `${field.replace(/([A-Z])/g, ' $1').toLowerCase()} for ${data.unit.toLowerCase()} must be a whole number`,
            path: [field],
          });
        }
      }
    }
  });

export const updateItemSchema = z
  .object({
    name: z.string().trim().min(2).max(100).optional(),
    description: descriptionSchema,
    category: itemCategorySchema.optional(),
    unitCost: moneySchema.optional(),
    leadTimeDays: z.coerce.number().int().min(0).max(3650).optional(),
    minStock: quantitySchema.optional(),
    reorderLevel: quantitySchema.optional(),
    targetStock: quantitySchema.optional(),
    supplierId: supplierIdSchema,
    isActive: z.boolean().optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, 'At least one item field is required');

const emptyToUndefined = (value: unknown) => (value === '' || value === undefined ? undefined : value);

export const itemListQuerySchema = z
  .object({
    category: z.preprocess(emptyToUndefined, itemCategorySchema.optional()),
    status: z.preprocess(
      emptyToUndefined,
      z.enum(['OUT_OF_STOCK', 'LOW_STOCK', 'NEEDS_REORDER', 'HEALTHY']).optional()
    ),
    search: z.preprocess(emptyToUndefined, z.string().trim().max(100).optional()),
    supplierId: z.preprocess(emptyToUndefined, z.string().trim().min(1).optional()),
    activeOnly: z.enum(['true', 'false']).optional(),
    archivedOnly: z.enum(['true', 'false']).optional(),
  })
  .strict();
