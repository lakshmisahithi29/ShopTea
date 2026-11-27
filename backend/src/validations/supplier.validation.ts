import { z } from 'zod';

export const createSupplierSchema = z.object({
  name: z.string().trim().min(2, 'Supplier name must be at least 2 characters'),
  phone: z.string().trim().min(10, 'Valid phone number is required (min 10 digits)'),
  email: z.string().trim().email('Valid email address required').optional().or(z.literal('')),
  address: z.string().trim().optional().or(z.literal('')),
  notes: z.string().trim().optional().or(z.literal('')),
});

export const updateSupplierSchema = z.object({
  name: z.string().trim().min(2, 'Supplier name must be at least 2 characters').optional(),
  phone: z.string().trim().min(10, 'Valid phone number is required').optional(),
  email: z.string().trim().email('Valid email address required').optional().or(z.literal('')),
  address: z.string().trim().optional().or(z.literal('')),
  notes: z.string().trim().optional().or(z.literal('')),
  isActive: z.boolean().optional(),
});
