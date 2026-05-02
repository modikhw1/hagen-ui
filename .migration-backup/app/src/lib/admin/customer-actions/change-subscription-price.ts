import 'server-only';

import { recordAuditLog } from '@/lib/admin/audit-log';
import { persistCustomerSubscriptionPriceChange } from '@/lib/admin/customer-billing-store';
import { syncOperationalSubscriptionState } from '@/lib/admin/subscription-operational-sync';
import type { CustomerAction } from '@/lib/admin/schemas/customer-actions';
import { applySubscriptionPriceChange } from '@/lib/stripe/admin-billing';
import { withCustomerActionLock } from './lock';
import {
  actionFailure,
  actionSuccess,
  buildCustomerActionAuditMetadata,
  toOperationalProfileInput,
} from './shared';
import type { ActionResult, AdminActionContext } from './types';

type ChangeSubscriptionPriceInput = Extract<
  CustomerAction,
  { action: 'change_subscription_price' }
>;

export async function handleChangeSubscriptionPrice(
  ctx: AdminActionContext,
  input: ChangeSubscriptionPriceInput,
): Promise<ActionResult> {
  return withCustomerActionLock(ctx, 'billing', async () => {
    const result = await applySubscriptionPriceChange({
      supabaseAdmin: ctx.supabaseAdmin,
      stripeClient: ctx.stripeClient,
      profileId: ctx.id,
      monthlyPriceSek: input.monthly_price,
      mode: input.mode,
      requestId: ctx.requestId,
    });

    let profile: Record<string, unknown>;
    try {
      profile = await persistCustomerSubscriptionPriceChange({
        supabaseAdmin: ctx.supabaseAdmin,
        customerId: ctx.id,
        stripeSubscriptionId:
          typeof ctx.beforeProfile?.stripe_subscription_id === 'string'
            ? ctx.beforeProfile.stripe_subscription_id
            : null,
        stripeScheduleId:
          'stripeScheduleId' in result ? result.stripeScheduleId ?? null : null,
        stripePriceId:
          'stripePriceId' in result ? result.stripePriceId ?? null : null,
        monthlyPriceSek: input.monthly_price,
        mode: input.mode,
        effectiveDate: result.effectiveDate,
        createdBy: ctx.user.id,
        metadata: {
          request_id: ctx.requestId,
        },
      });
    } catch (error) {
      return actionFailure({
        error:
          error instanceof Error
            ? error.message
            : 'Kunde inte uppdatera kundprofil',
        statusCode: 500,
      });
    }

    await syncOperationalSubscriptionState({
      supabaseAdmin: ctx.supabaseAdmin,
      customerProfileId: ctx.id,
      profile: toOperationalProfileInput(profile as never),
    });
    await recordAuditLog(ctx.supabaseAdmin, {
      actorUserId: ctx.user.id,
      actorEmail: ctx.user.email,
      actorRole: ctx.user.role,
      action: 'admin.customer.subscription_price_changed',
      entityType: 'subscription',
      entityId: String(ctx.beforeProfile?.stripe_subscription_id ?? ctx.id),
      beforeState: ctx.beforeProfile,
      afterState: profile as unknown as Record<string, unknown>,
      metadata: buildCustomerActionAuditMetadata(ctx, {
        mode: input.mode,
        monthly_price: input.monthly_price,
        effective_date: result.effectiveDate,
        idempotency_key: ctx.requestId,
        stripe_schedule_id:
          'stripeScheduleId' in result ? result.stripeScheduleId ?? null : null,
        stripe_price_id:
          'stripePriceId' in result ? result.stripePriceId ?? null : null,
      }),
    });

    return actionSuccess({
      profile,
      subscription: result.subscription,
      effective_date: result.effectiveDate,
    });
  });
}
