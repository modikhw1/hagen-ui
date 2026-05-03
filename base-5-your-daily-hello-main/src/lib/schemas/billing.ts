import { differenceInCalendarMonths, format, parseISO } from 'date-fns';
import { z } from 'zod';

const discountDurationSchema = z.number().int().min(1).max(36);
const nullableDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Ogiltigt datum')
  .nullable()
  .optional();
const idempotencyTokenSchema = z.string().uuid().optional();

const todayYmd = () => format(new Date(), 'yyyy-MM-dd');

const missingLimitedDurationMessage =
  'Ange antal månader eller välj en specifik period för tidsbegränsad rabatt.';

function validateTimedDiscount(
  input: {
    ongoing: boolean;
    duration_months: number | null;
    start_date?: string | null;
    end_date?: string | null;
  },
  ctx: z.RefinementCtx,
) {
  const hasStartDate = Boolean(input.start_date);
  const hasEndDate = Boolean(input.end_date);
  const usesSpecificPeriod = hasStartDate || hasEndDate;
  const usesDurationMonths = input.duration_months !== null;

  if (input.ongoing) {
    if (usesDurationMonths) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['duration_months'],
        message: 'Varaktighet ska vara tom när rabatten gäller tillsvidare.',
      });
    }

    if (usesSpecificPeriod) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['start_date'],
        message: 'Specifik period kan inte kombineras med tillsvidare.',
      });
    }

    return;
  }

  if (!usesDurationMonths && !usesSpecificPeriod) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['duration_months'],
      message: missingLimitedDurationMessage,
    });
    return;
  }

  if (usesDurationMonths && usesSpecificPeriod) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['start_date'],
      message: 'Välj antingen antal månader eller specifik period.',
    });
    return;
  }

  if (!usesSpecificPeriod) {
    return;
  }

  if (!hasStartDate) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['start_date'],
      message: 'Ange startdatum för den specifika perioden.',
    });
  }

  if (!hasEndDate) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['end_date'],
      message: 'Ange slutdatum för den specifika perioden.',
    });
  }

  if (!hasStartDate || !hasEndDate) {
    return;
  }

  if ((input.start_date as string) > (input.end_date as string)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['end_date'],
      message: 'Slutdatum måste vara samma dag eller senare än startdatum.',
    });
  }

  if ((input.start_date as string) > todayYmd()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['start_date'],
      message: 'Startdatum kan inte ligga i framtiden när rabatten aktiveras direkt.',
    });
  }
}

export const subscriptionPriceChangeSchema = z
  .object({
    monthly_price: z.number().int().positive().max(1_000_000),
    mode: z.enum(['now', 'next_period']),
  })
  .strict();

export const billingDiscountSchema = z.discriminatedUnion('type', [
  z
    .object({
      type: z.literal('percent'),
      value: z.number().int().min(1).max(100),
      ongoing: z.boolean(),
      duration_months: discountDurationSchema.nullable(),
      start_date: nullableDateSchema,
      end_date: nullableDateSchema,
      idempotency_token: idempotencyTokenSchema,
    })
    .strict()
    .superRefine(validateTimedDiscount),
  z
    .object({
      type: z.literal('amount'),
      value: z.number().int().positive(),
      ongoing: z.boolean(),
      duration_months: discountDurationSchema.nullable(),
      start_date: nullableDateSchema,
      end_date: nullableDateSchema,
      idempotency_token: idempotencyTokenSchema,
    })
    .strict()
    .superRefine(validateTimedDiscount),
  z
    .object({
      type: z.literal('free_months'),
      duration_months: discountDurationSchema,
      start_date: nullableDateSchema,
      end_date: nullableDateSchema,
      idempotency_token: idempotencyTokenSchema,
    })
    .strict()
    .superRefine((input, ctx) => {
      if (input.start_date || input.end_date) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['start_date'],
          message: 'Gratis månader styrs via antal månader och kan inte ha specifik period.',
        });
      }
    }),
]);

export type SubscriptionPriceChangeInput = z.infer<typeof subscriptionPriceChangeSchema>;
export type BillingDiscountInput = z.infer<typeof billingDiscountSchema>;

/**
 * Line-item-baserad rabatt: läggs som negativ rad på nästa faktura/fakturor
 * istället för att skapa en Stripe-coupon. Föredragen modell för engångs-
 * och tidsbegränsade rabatter (1–12 mån).
 */
export const billingDiscountLineItemSchema = z.discriminatedUnion('type', [
  z
    .object({
      type: z.literal('amount'),
      // SEK per månad som ska dras av
      value: z.number().int().positive().max(1_000_000),
      // Antal kommande fakturor rabatten ska gälla på
      months: z.number().int().min(1).max(12),
      description: z.string().trim().min(1).max(120).optional(),
      idempotency_token: idempotencyTokenSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal('percent'),
      value: z.number().int().min(1).max(100),
      months: z.number().int().min(1).max(12),
      description: z.string().trim().min(1).max(120).optional(),
      idempotency_token: idempotencyTokenSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal('free_months'),
      months: z.number().int().min(1).max(12),
      description: z.string().trim().min(1).max(120).optional(),
      idempotency_token: idempotencyTokenSchema,
    })
    .strict(),
]);

export type BillingDiscountLineItemInput = z.infer<typeof billingDiscountLineItemSchema>;

export function hasBillingDiscountSpecificPeriod(input: {
  ongoing: boolean;
  startDate?: string | null;
  endDate?: string | null;
}) {
  return !input.ongoing && Boolean(input.startDate && input.endDate);
}

export function deriveBillingDiscountDurationMonths(input: BillingDiscountInput) {
  if (input.type === 'free_months') {
    return input.duration_months;
  }

  if (input.ongoing) {
    return null;
  }

  if (input.duration_months !== null) {
    return input.duration_months;
  }

  if (!input.start_date || !input.end_date) {
    return null;
  }

  return Math.max(
    1,
    differenceInCalendarMonths(parseISO(input.end_date), parseISO(input.start_date)) + 1,
  );
}
