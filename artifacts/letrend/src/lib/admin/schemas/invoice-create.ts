import { z } from 'zod';

// OBS: amount_ore (Stripe-standard). UI:t pratar kronor men multiplicerar
// med 100 innan submit. Servern måste matcha. Se AVTAL_AUDIT.md (#A3-D1).
export const manualInvoiceItemSchema = z.object({
  description: z.string().trim().min(1).max(200),
  // Max 50_000_000 öre = 500 000 kr per rad. Skydd mot scroll/typo.
  // Se AVTAL_AUDIT.md (#A3-D5).
  amount_ore: z.number().int().positive().max(50_000_000),
});

export const createManualInvoiceSchema = z
  .object({
    customer_profile_id: z.string().uuid(),
    items: z.array(manualInvoiceItemSchema).min(1).max(50),
    days_until_due: z.number().int().min(1).max(90).default(14),
    auto_finalize: z.boolean().default(true),
    // Idempotensnyckel per modal-instans (uuid v4). Servern speglar denna
    // mot Stripes Idempotency-Key så dubbelklick/retry inte skapar två
    // fakturor. Se AVTAL_AUDIT.md (#A3-D2).
    idempotency_key: z.string().uuid().optional(),
  })
  .strict();

export type DraftInvoiceItem = z.infer<typeof manualInvoiceItemSchema>;
