import { z } from 'zod';

export const manualInvoiceItemSchema = z.object({
  description: z.string().trim().min(1).max(200),
  amount: z.number().int().positive(),
});

export const createManualInvoiceSchema = z
  .object({
    customer_profile_id: z.string().uuid(),
    items: z.array(manualInvoiceItemSchema).min(1),
    days_until_due: z.number().int().min(1).max(90).default(14),
    auto_finalize: z.boolean().default(true),
  })
  .strict();

export type DraftInvoiceItem = z.infer<typeof manualInvoiceItemSchema>;
