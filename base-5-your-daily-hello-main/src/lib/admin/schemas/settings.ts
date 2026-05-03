import { z } from 'zod';

export const adminSettingsDtoSchema = z.object({
  default_billing_interval: z.enum(['month', 'quarter', 'year']),
  default_payment_terms_days: z.number().int().min(1).max(120),
  default_currency: z.string().regex(/^[A-Z]{3}$/),
  default_commission_rate: z.number().min(0).max(1),
  updated_at: z.string().datetime({ offset: true }).nullable(),
});

export const updateAdminSettingsInputSchema = z
  .object({
    default_billing_interval: z.enum(['month', 'quarter', 'year']),
    default_payment_terms_days: z.number().int().min(1).max(120),
    default_currency: z.string().trim().regex(/^[A-Za-z]{3}$/),
    default_commission_rate: z.number().min(0).max(1).optional(),
    default_commission_rate_percent: z.number().min(0).max(100).optional(),
  })
  .strict()
  .transform((value) => ({
    default_billing_interval: value.default_billing_interval,
    default_payment_terms_days: value.default_payment_terms_days,
    default_currency: value.default_currency.trim().toUpperCase(),
    default_commission_rate:
      value.default_commission_rate ??
      (value.default_commission_rate_percent ?? 0) / 100,
  }));

export const adminSettingsResponseSchema = z.object({
  settings: adminSettingsDtoSchema,
  schemaWarnings: z.array(z.string()).optional(),
});

export type AdminSettingsDto = z.infer<typeof adminSettingsDtoSchema>;
export type AdminSettingsResponse = z.infer<typeof adminSettingsResponseSchema>;
