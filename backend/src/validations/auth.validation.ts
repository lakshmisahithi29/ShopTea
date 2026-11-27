import { z } from 'zod';

export const registerSchema = z.object({
  username: z
    .string()
    .trim()
    .min(4, 'Username must be at least 4 characters')
    .max(20, 'Username cannot exceed 20 characters')
    .regex(/^[a-zA-Z0-9_]+$/, 'Username can only contain letters, numbers, and underscores')
    .transform((val) => val.toLowerCase()),
  email: z
    .string()
    .trim()
    .email('Please enter a valid email address')
    .toLowerCase(),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters long')
    .regex(/[A-Za-z]/, 'Password must contain at least one letter')
    .regex(/[0-9]/, 'Password must contain at least one number'),
});

export const loginSchema = z.object({
  identifier: z
    .string()
    .trim()
    .min(1, 'Username or email is required')
    .transform((val) => val.toLowerCase()),
  password: z.string().min(1, 'Password is required'),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;

export const updateProfileSchema = z
  .object({
    name: z.string().trim().min(1, 'Name is required').max(80, 'Name cannot exceed 80 characters'),
  })
  .strict();

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

// Kept as compatibility exports for existing validation consumers.
export { createShopSchema } from './shop.validation';
export type { CreateShopInput } from './shop.validation';
