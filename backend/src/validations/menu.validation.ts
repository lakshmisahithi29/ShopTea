import { z } from 'zod';

export const menuCategorySchema = z.enum(['TEA', 'COFFEE', 'BEVERAGE', 'SNACK', 'OTHER']);

export const recipeItemSchema = z.object({
  itemId: z.string().trim().min(1),
  quantity: z.number().positive('Recipe quantity must be greater than zero').max(999_999_999.999),
}).strict();

export const menuItemSchema = z.object({
  name: z.string().trim().min(1, 'Menu item name is required').max(100),
  description: z.string().trim().max(1000).optional().nullable(),
  category: menuCategorySchema.default('TEA'),
  sellingPrice: z.number().positive('Selling price must be greater than zero').max(9_999_999_999.99),
  isActive: z.boolean().optional(),
  recipeItems: z.array(recipeItemSchema).min(1, 'Add at least one recipe ingredient').max(50),
}).strict().refine((value) => new Set(value.recipeItems.map((item) => item.itemId)).size === value.recipeItems.length, {
  message: 'Each inventory item can appear only once in a recipe',
  path: ['recipeItems'],
});

export const menuListQuerySchema = z.object({
  search: z.string().trim().optional(),
  category: menuCategorySchema.optional(),
  activeOnly: z.enum(['true', 'false']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
}).strict();
