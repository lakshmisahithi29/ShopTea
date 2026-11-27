import { z } from 'zod';

const emptyToUndefined = (value: unknown) => (value === '' || value === undefined ? undefined : value);

export const forecastQuerySchema = z
  .object({
    historyDays: z.coerce.number().int().min(7).max(90).default(30),
    forecastDays: z.coerce.number().int().min(1).max(30).default(7),
    windowDays: z.coerce.number().int().min(3).max(14).default(7),
    safetyBufferDays: z.coerce.number().int().min(0).max(14).default(2),
    itemId: z.preprocess(emptyToUndefined, z.string().uuid().optional()),
  })
  .strict();
