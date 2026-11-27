import { z } from 'zod';

const emptyToUndef = (value: unknown) => (value === '' || value === undefined ? undefined : value);

const dateInput = z.preprocess(
  emptyToUndef,
  z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}(T.*)?$/, 'Date must be YYYY-MM-DD')
    .optional()
);

export const dashboardRangeQuerySchema = z.object({
  from: dateInput,
  to: dateInput,
});
