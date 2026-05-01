import { z } from 'zod';
import { sendInviteActionSchema } from '@/lib/schemas/customer';

export const pauseSubscriptionActionSchema = z
  .object({
    action: z.literal('pause_subscription'),
    pause_until: z.string().trim().min(1).optional().nullable(),
  })
  .strict();

export const cancelSubscriptionActionSchema = z
  .object({
    action: z.literal('cancel_subscription'),
    mode: z
      .enum(['end_of_period', 'immediate', 'immediate_with_credit'])
      .default('end_of_period'),
    credit_amount_ore: z.number().int().min(0).optional().nullable(),
    invoice_id: z.string().trim().min(1).optional().nullable(),
    memo: z.string().trim().max(1000).optional().nullable(),
    reason: z
      .enum(['duplicate', 'fraudulent', 'order_change', 'product_unsatisfactory'])
      .optional()
      .nullable(),
    credit_settlement_mode: z
      .enum(['refund', 'customer_balance', 'outside_stripe'])
      .optional()
      .nullable(),
  })
  .strict();

export const changeSubscriptionPriceActionSchema = z
  .object({
    action: z.literal('change_subscription_price'),
    monthly_price: z.number().min(0).max(1_000_000),
    mode: z.enum(['now', 'next_period']),
    discount: z
      .object({
        type: z.string(),
        value: z.number(),
        duration_months: z.number(),
      })
      .nullable()
      .optional(),
  })
  .strict();

export const changeAccountManagerActionSchema = z
  .object({
    action: z.literal('change_account_manager'),
    cm_id: z.string().uuid().optional().nullable(),
    effective_date: z.string().trim().min(1),
    handover_note: z.string().trim().max(1000).optional().nullable(),
  })
  .strict();

export const resendInviteActionSchema = z
  .object({
    action: z.literal('resend_invite'),
  })
  .strict();

export const reactivateArchiveActionSchema = z
  .object({
    action: z.literal('reactivate_archive'),
  })
  .strict();

export const setTemporaryCoverageActionSchema = z
  .object({
    action: z.literal('set_temporary_coverage'),
    covering_cm_id: z.string().uuid(),
    starts_on: z.string().trim().min(1),
    ends_on: z.string().trim().min(1),
    note: z.string().trim().max(1000).optional().nullable(),
    compensation_mode: z
      .enum(['covering_cm', 'primary_cm'])
      .default('covering_cm'),
  })
  .strict();

export const activateActionSchema = z
  .object({
    action: z.literal('activate'),
  })
  .strict();

export const sendReminderActionSchema = z
  .object({
    action: z.literal('send_reminder'),
  })
  .strict();

export const resumeSubscriptionActionSchema = z
  .object({
    action: z.literal('resume_subscription'),
  })
  .strict();

export const updateProfileActionSchema = z
  .object({
    action: z.literal('update_profile'),
  })
  .passthrough();

export const customerActionSchema = z.discriminatedUnion('action', [
  updateProfileActionSchema,
  sendInviteActionSchema,
  activateActionSchema,
  sendReminderActionSchema,
  resendInviteActionSchema,
  reactivateArchiveActionSchema,
  setTemporaryCoverageActionSchema,
  cancelSubscriptionActionSchema,
  pauseSubscriptionActionSchema,
  resumeSubscriptionActionSchema,
  changeSubscriptionPriceActionSchema,
  changeAccountManagerActionSchema,
]);

const actionMetaSchema = z
  .object({
    requestId: z.string(),
    durationMs: z.number(),
    affectedEntities: z
      .array(
        z.object({
          type: z.string(),
          id: z.string(),
        }),
      )
      .optional(),
  })
  .partial();

const customerActionV2SuccessSchema = z
  .object({
    success: z.literal(true),
    data: z.unknown(),
    meta: actionMetaSchema.optional(),
  })
  .passthrough();

const customerActionLegacySuccessSchema = z
  .object({
    success: z.boolean().optional(),
    message: z.string().optional(),
    customer: z.record(z.string(), z.unknown()).optional(),
    profile: z.record(z.string(), z.unknown()).optional(),
    absence: z.record(z.string(), z.unknown()).optional(),
    assignment: z.record(z.string(), z.unknown()).optional(),
    subscription: z.record(z.string(), z.unknown()).optional(),
    stripe_customer_id: z.string().nullable().optional(),
    stripe_subscription_id: z.string().nullable().optional(),
    effective_date: z.string().optional(),
    already_registered: z.boolean().optional(),
    cleanup: z.unknown().optional(),
  })
  .passthrough();

export const customerActionErrorSchema = z
  .object({
    success: z.literal(false).optional(),
    error: z.string(),
    statusCode: z.number().optional(),
    details: z.unknown().optional(),
    meta: actionMetaSchema.optional(),
  })
  .passthrough();

export const customerActionResultSchema = z.union([
  customerActionV2SuccessSchema,
  customerActionLegacySuccessSchema,
  customerActionErrorSchema,
]);

export type CustomerAction = z.infer<typeof customerActionSchema>;
export type CustomerActionSuccessResult = z.infer<
  typeof customerActionV2SuccessSchema
>;
export type CustomerActionErrorResult = z.infer<
  typeof customerActionErrorSchema
> & {
  status: number;
};
