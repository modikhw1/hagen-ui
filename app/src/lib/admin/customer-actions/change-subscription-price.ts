import 'server-only';

import { recordAuditLog } from '@/lib/admin/audit-log';
import { syncOperationalSubscriptionState } from '@/lib/admin/subscription-operational-sync';
import type { CustomerAction } from '@/lib/admin/schemas/customer-actions';
import { applySubscriptionPriceChange } from '@/lib/stripe/admin-billing';
import { jsonError } from '@/lib/server/api-response';
import type { TablesUpdate } from '@/types/database';
import { toOperationalProfileInput } from './shared';
import type { ActionResult, AdminActionContext } from './types';

type ChangeSubscriptionPriceInput = Extract<
  CustomerAction,
  { action: 'change_subscription_price' }
>;

export async function handleChangeSubscriptionPrice(
  ctx: AdminActionContext,
  input: ChangeSubscriptionPriceInput,
): Promise<ActionResult> {
  const result = await applySubscriptionPriceChange({
    supabaseAdmin: ctx.supabaseAdmin,
    stripeClient: ctx.stripeClient,
    profileId: ctx.id,
    monthlyPriceSek: input.monthly_price,
    mode: input.mode,
  });

  const updatePayload: TablesUpdate<'customer_profiles'> =
    input.mode === 'now'
      ? {
          monthly_price: input.monthly_price,
          pricing_status: 'fixed',
          upcoming_monthly_price: null,
          upcoming_price_effective_date: null,
        }
      : {
          upcoming_monthly_price: input.monthly_price,
          upcoming_price_effective_date: result.effectiveDate,
        };

  const { data: profile, error } = await ctx.supabaseAdmin
    .from('customer_profiles')
    .update(updatePayload)
    .eq('id', ctx.id)
    .select()
    .single();

  if (error) {
    return jsonError(error.message, 500);
  }

  await syncOperationalSubscriptionState({
    supabaseAdmin: ctx.supabaseAdmin,
    customerProfileId: ctx.id,
    profile: toOperationalProfileInput(profile),
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
    metadata: {
      mode: input.mode,
      monthly_price: input.monthly_price,
      effective_date: result.effectiveDate,
    },
  });

  return {
    success: true,
    profile,
    subscription: result.subscription,
    effective_date: result.effectiveDate,
  };
}
