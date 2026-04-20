import { z } from 'zod';

const customerDiscountTypeSchema = z
  .enum(['percent', 'amount', 'free_months', 'free_period'])
  .transform((value) => (value === 'free_period' ? 'free_months' : value));

export const customerDiscountSchema = z.object({
  type: customerDiscountTypeSchema,
  value: z.number().min(0),
  duration_months: z.number().int().min(1).max(36).nullable().optional(),
  ongoing: z.boolean().default(false),
}).strict();

export type CustomerDiscountPayload = z.infer<typeof customerDiscountSchema>;
