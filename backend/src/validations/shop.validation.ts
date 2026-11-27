import { z } from 'zod';

export const shopTypeSchema = z.enum(['TEA_SHOP', 'CAFE', 'RESTAURANT', 'OTHER']);

export const currencySchema = z.enum(['INR', 'USD', 'EUR', 'GBP', 'AED']);

export const timezoneSchema = z
  .string()
  .trim()
  .min(1, 'Timezone is required')
  .max(64, 'Timezone cannot exceed 64 characters')
  .refine((value) => {
    try {
      new Intl.DateTimeFormat('en', { timeZone: value }).format();
      return true;
    } catch {
      return false;
    }
  }, 'Please provide a valid IANA timezone');

export const shopSettingsSchema = z
  .object({
    lowStockAlerts: z.boolean().default(true),
    weekStartsOn: z.union([z.literal(0), z.literal(1)]).default(1),
    dateFormat: z.enum(['DD/MM/YYYY', 'MM/DD/YYYY']).default('DD/MM/YYYY'),
  })
  .strict();

const shopNameSchema = z
  .string()
  .trim()
  .min(2, 'Shop name must be at least 2 characters')
  .max(120, 'Shop name cannot exceed 120 characters');

const ownerNameSchema = z
  .string()
  .trim()
  .min(2, 'Owner name must be at least 2 characters')
  .max(120, 'Owner name cannot exceed 120 characters');

const phoneSchema = z
  .string()
  .trim()
  .min(10, 'Valid phone number is required (min 10 digits)')
  .max(20, 'Phone number cannot exceed 20 characters')
  .regex(/^[+\d\s().-]+$/, 'Phone number contains invalid characters')
  .refine((value) => value.replace(/\D/g, '').length >= 10, 'Valid phone number is required (min 10 digits)');

const defaultSettings = {
  lowStockAlerts: true,
  weekStartsOn: 1 as const,
  dateFormat: 'DD/MM/YYYY' as const,
};

export const createShopSchema = z
  .object({
    name: shopNameSchema,
    ownerName: ownerNameSchema,
    phone: phoneSchema,
    address: z.string().trim().max(500, 'Address cannot exceed 500 characters').optional(),
    currency: currencySchema.default('INR'),
    type: shopTypeSchema.default('TEA_SHOP'),
    timezone: timezoneSchema.default('Asia/Kolkata'),
    settings: shopSettingsSchema.default(defaultSettings),
  })
  .strict();

export const updateShopSchema = z
  .object({
    name: shopNameSchema.optional(),
    ownerName: ownerNameSchema.optional(),
    phone: phoneSchema.optional(),
    address: z.string().trim().max(500, 'Address cannot exceed 500 characters').optional(),
    currency: currencySchema.optional(),
    type: shopTypeSchema.optional(),
    timezone: timezoneSchema.optional(),
    settings: shopSettingsSchema.optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, 'At least one shop field must be provided');

export type CreateShopInput = z.infer<typeof createShopSchema>;
export type UpdateShopInput = z.infer<typeof updateShopSchema>;
export type ShopSettingsInput = z.infer<typeof shopSettingsSchema>;
