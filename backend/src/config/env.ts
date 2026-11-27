import dotenv from 'dotenv';
import path from 'path';
import { z } from 'zod';

dotenv.config({ path: path.resolve(__dirname, '../../../.env.local') });
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const DEVELOPMENT_JWT_SECRET = 'fallback_secret_for_local_dev_minimum_32_characters_long';

const envSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(5000),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  CLIENT_URL: z.string().url().default('http://localhost:5173'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  DATABASE_URL_UNPOOLED: z.string().optional(),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters').default(DEVELOPMENT_JWT_SECRET),
  JWT_EXPIRES_IN: z.string().regex(/^\d+(ms|s|m|h|d|w)$/, 'JWT_EXPIRES_IN must be a duration such as 7d').default('7d'),
  COOKIE_SAME_SITE: z.enum(['lax', 'strict', 'none']).optional(),
});

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  console.error('Invalid environment variables:', parsedEnv.error.issues);
  process.exit(1);
}

if (
  parsedEnv.data.NODE_ENV === 'production' &&
  parsedEnv.data.JWT_SECRET === DEVELOPMENT_JWT_SECRET
) {
  console.error('JWT_SECRET must be explicitly configured in production.');
  process.exit(1);
}

export const env = parsedEnv.data;
