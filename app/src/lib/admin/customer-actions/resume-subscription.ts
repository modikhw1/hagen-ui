import 'server-only';

import { recordAuditLog } from '@/lib/admin/audit-log';
import { syncOperationalSubscriptionState } from '@/lib/admin/subscription-operational-sync';
import type { CustomerAction } from '@/lib/admin/schemas/customer-actions';
import { resumeCustomerSubscription } from '@/lib/stripe/admin-billing';
import { jsonError } from '@/lib/server/api-response';
import { buildCustomerActionAuditMetadata, toOperationalProfileInput } from './shared';
import type { ActionResult, AdminActionContext } from './types';

type ResumeSubscriptionInput = Extract<
  CustomerAction,
  { action: 'resume_subscription' }
>;

export async function handleResumeSubscription(
  ctx: AdminActionContext,
  input: ResumeSubscriptionInput,
): Promise<ActionResult> {
  void input;
  const subscription = await resumeCustomerSubscription({
    supabaseAdmin: ctx.supabaseAdmin,
    stripeClient: ctx.stripeClient,
    profileId: ctx.id,
    requestId: ctx.requestId,
  });

  const { data: profile, error } = await ctx.supabaseAdmin
    .from('customer_profiles')
    .update({
      paused_until: null,
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
    action: 'admin.customer.subscription_resumed',
    entityType: 'subscription',
    entityId: String(ctx.beforeProfile?.stripe_subscription_id ?? ctx.id),
    beforeState: ctx.beforeProfile,
    afterState: profile as unknown as Record<string, unknown>,
    metadata: buildCustomerActionAuditMetadata(ctx, {
      idempotency_key: ctx.requestId,
    }),
  });

  return { success: true, subscription, profile };
}
