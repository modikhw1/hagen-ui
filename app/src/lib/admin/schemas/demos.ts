import { z } from 'zod';

export const demoStatusSchema = z.enum([
  'draft',
  'sent',
  'opened',
  'responded',
  'won',
  'lost',
  'expired',
]);

export const demoCardDtoSchema = z.object({
  id: z.string().uuid(),
  companyName: z.string(),
  contactEmail: z.string().email().nullable(),
  tiktokHandle: z.string().nullable(),
  proposedConceptsPerWeek: z.number().int().nullable(),
  proposedPriceOre: z.number().int().nullable(),
  status: demoStatusSchema,
  statusChangedAt: z.string().datetime({ offset: true }),
  ownerName: z.string().nullable(),
  lostReason: z.string().nullable(),
  nextStatus: demoStatusSchema.nullable(),
  convertedCustomerId: z.string().uuid().nullable(),
});

export const demosBoardDtoSchema = z.object({
  sentLast30: z.number().int(),
  sentPrev30: z.number().int(),
  openedLast30: z.number().int(),
  openedPrev30: z.number().int(),
  convertedLast30: z.number().int(),
  convertedPrev30: z.number().int(),
  totalOnBoard: z.number().int(),
  columns: z.object({
    draft: z.array(demoCardDtoSchema),
    sent: z.array(demoCardDtoSchema),
    opened: z.array(demoCardDtoSchema),
    responded: z.array(demoCardDtoSchema),
    closed: z.array(demoCardDtoSchema),
  }),
  schemaWarnings: z.array(z.string()).optional(),
});

const nullableTrimmedString = z
  .union([z.string(), z.null(), z.undefined()])
  .transform((value) => {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  });

export const createDemoInputSchema = z
  .object({
    company_name: z.string().trim().min(1).max(200),
    contact_name: nullableTrimmedString,
    contact_email: nullableTrimmedString.refine(
      (value) => value === null || z.string().email().safeParse(value).success,
      'Ogiltig e-postadress',
    ),
    tiktok_handle: nullableTrimmedString.transform((value) =>
      value?.startsWith('@') ? value.slice(1) : value,
    ),
    proposed_concepts_per_week: z.number().int().min(1).max(7).nullable().optional(),
    proposed_price_ore: z.number().int().min(0).nullable().optional(),
    status: demoStatusSchema.optional().default('draft'),
    lost_reason: nullableTrimmedString.optional(),
  })
  .strict();

export const updateDemoStatusInputSchema = z
  .object({
    status: demoStatusSchema,
    lost_reason: nullableTrimmedString.optional(),
  })
  .strict();

export const convertDemoInputSchema = z
  .object({
    send_invite: z.boolean().optional().default(false),
    billing_day_of_month: z.number().int().min(1).max(28).optional(),
    contract_start_date: nullableTrimmedString.optional(),
  })
  .strict();

export const convertDemoResultSchema = z.object({
  customer: z.object({
    id: z.string().uuid(),
    business_name: z.string(),
    contact_email: z.string().nullable(),
  }),
  demo: z.object({
    id: z.string().uuid(),
    status: demoStatusSchema,
  }),
  invite_sent: z.boolean().optional(),
  warning: z.string().nullable().optional(),
  was_idempotent_replay: z.boolean().optional(),
});

export type DemoStatus = z.infer<typeof demoStatusSchema>;
export type DemoCardDto = z.infer<typeof demoCardDtoSchema>;
export type DemosBoardDto = z.infer<typeof demosBoardDtoSchema>;
export type CreateDemoInput = z.infer<typeof createDemoInputSchema>;
export type UpdateDemoStatusInput = z.infer<typeof updateDemoStatusInputSchema>;
export type ConvertDemoInput = z.infer<typeof convertDemoInputSchema>;
