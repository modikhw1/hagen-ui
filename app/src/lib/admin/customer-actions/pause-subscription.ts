import 'server-only';

import { recordAuditLog } from '@/lib/admin/audit-log';
import { syncOperationalSubscriptionState } from '@/lib/admin/subscription-operational-sync';
import type { CustomerAction } from '@/lib/admin/schemas/customer-actions';
import { pauseCustomerSubscription } from '@/lib/stripe/admin-billing';
import { jsonError } from '@/lib/server/api-response';
import { withCustomerActionLock } from './lock';
import { buildCustomerActionAuditMetadata, toOperationalProfileInput } from './shared';
import type { ActionResult, AdminActionContext } from './types';

type PauseSubscriptionInput = Extract<
  CustomerAction,
  { action: 'pause_subscription' }
>;

export async function handlePauseSubscription(
  ctx: AdminActionContext,
  input: PauseSubscriptionInput,
): Promise<ActionResult> {
  return withCustomerActionLock(ctx, 'billing', async () => {
    const pauseUntil = input.pause_until ?? null;
    const subscription = await pauseCustomerSubscription({
      supabaseAdmin: ctx.supabaseAdmin,
      stripeClient: ctx.stripeClient,
      profileId: ctx.id,
      pauseUntil,
      requestId: ctx.requestId,
    });

    const { data: profile, error } = await ctx.supabaseAdmin
      .from('customer_profiles')
      .update({
        paused_until: pauseUntil,
      })
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
      action: 'admin.customer.subscription_paused',
      entityType: 'subscription',
      entityId: String(ctx.beforeProfile?.stripe_subscription_id ?? ctx.id),
      beforeState: ctx.beforeProfile,
      afterState: profile as unknown as Record<string, unknown>,
      metadata: buildCustomerActionAuditMetadata(ctx, {
        pause_until: pauseUntil,
        idempotency_key: ctx.requestId,
      }),
    });

    return { success: true, subscription, profile };
  });
}
