import 'server-only';

import { recordAuditLog } from '@/lib/admin/audit-log';
import { syncCustomerAssignmentFromProfile } from '@/lib/admin/cm-assignments';
import { SERVER_COPY } from '@/lib/admin/copy/server-errors';
import { syncOperationalSubscriptionState } from '@/lib/admin/subscription-operational-sync';
import { profileToInvitePayload } from '@/lib/admin/customer-detail/load';
import type { CustomerAction } from '@/lib/admin/schemas/customer-actions';
import { ensureStripeSubscriptionForProfile } from '@/lib/customers/invite';
import { upsertSubscriptionMirror } from '@/lib/stripe/mirror';
import { stripeEnvironment } from '@/lib/stripe/dynamic-config';
import { resumeCustomerSubscription } from '@/lib/stripe/admin-billing';
import {
  actionFailure,
  actionSuccess,
  buildCustomerActionAuditMetadata,
} from './shared';
import type { ActionResult, AdminActionContext } from './types';

type ReactivateInput = Extract<CustomerAction, { action: 'reactivate_archive' }>;

export async function handleReactivate(
  ctx: AdminActionContext,
  input: ReactivateInput,
): Promise<ActionResult> {
  void input;
  if (!ctx.beforeProfile) {
    return actionFailure({ error: SERVER_COPY.customerNotFound, statusCode: 404 });
  }

  const invitePayload = profileToInvitePayload(ctx.beforeProfile);
  const needsPaidSubscription =
    invitePayload.pricing_status === 'fixed' &&
    Number(invitePayload.monthly_price) > 0;
  let stripeCustomerId =
    typeof ctx.beforeProfile.stripe_customer_id === 'string'
      ? ctx.beforeProfile.stripe_customer_id
      : null;
  let stripeSubscriptionId =
    typeof ctx.beforeProfile.stripe_subscription_id === 'string'
      ? ctx.beforeProfile.stripe_subscription_id
      : null;
  let reactivatedSubscription = null;

  if (needsPaidSubscription) {
    if (!ctx.stripeClient) {
      return actionFailure({
        error:
          'Stripe är inte konfigurerat på servern och kunden kan inte återaktiveras med debitering.',
        statusCode: 503,
      });
    }

    try {
      const ensuredStripe = await ensureStripeSubscriptionForProfile({
        supabaseAdmin: ctx.supabaseAdmin,
        stripeClient: ctx.stripeClient,
        profileId: ctx.id,
        payload: invitePayload,
      });
      stripeCustomerId = ensuredStripe.stripeCustomerId;
      stripeSubscriptionId = ensuredStripe.stripeSubscriptionId;
      reactivatedSubscription = ensuredStripe.subscription;
    } catch (error) {
      return actionFailure({
        error:
          error instanceof Error
            ? error.message
            : 'Kunde inte återaktivera abonnemanget i Stripe',
        statusCode: 502,
      });
    }
  }

  const reactivatedAt = new Date().toISOString();
  const nextStatus = stripeSubscriptionId ? 'active' : 'pending';
  const { error: reactivateError } = await ctx.supabaseAdmin
    .from('customer_profiles')
    .update({
      status: nextStatus,
      stripe_customer_id: stripeCustomerId,
      stripe_subscription_id: stripeSubscriptionId,
      agreed_at:
        typeof ctx.beforeProfile.agreed_at === 'string'
          ? ctx.beforeProfile.agreed_at
          : reactivatedAt,
      paused_until: null,
    })
    .eq('id', ctx.id)
    .select('id')
    .single();

  if (reactivateError) {
    return actionFailure({ error: reactivateError.message, statusCode: 500 });
  }

  if (
    reactivatedSubscription &&
    ctx.stripeClient &&
    (reactivatedSubscription.pause_collection ||
      reactivatedSubscription.cancel_at_period_end)
  ) {
    reactivatedSubscription = await resumeCustomerSubscription({
      supabaseAdmin: ctx.supabaseAdmin,
      stripeClient: ctx.stripeClient,
      profileId: ctx.id,
      requestId: ctx.requestId,
    });
  }

  if (reactivatedSubscription) {
    await upsertSubscriptionMirror({
      supabaseAdmin: ctx.supabaseAdmin,
      subscription: reactivatedSubscription,
      environment: stripeEnvironment,
    });
  }

  await syncCustomerAssignmentFromProfile({
    supabaseAdmin: ctx.supabaseAdmin,
    customerProfileId: ctx.id,
  });
  await syncOperationalSubscriptionState({
    supabaseAdmin: ctx.supabaseAdmin,
    customerProfileId: ctx.id,
  });

  const { data: profile, error: profileError } = await ctx.supabaseAdmin
    .from('customer_profiles')
    .select('*')
    .eq('id', ctx.id)
    .single();

  if (profileError) {
    return actionFailure({ error: profileError.message, statusCode: 500 });
  }

  await recordAuditLog(ctx.supabaseAdmin, {
    actorUserId: ctx.user.id,
    actorEmail: ctx.user.email,
    actorRole: ctx.user.role,
    action: 'admin.customer.reactivated',
    entityType: 'customer_profile',
    entityId: ctx.id,
    beforeState: ctx.beforeProfile,
    afterState: profile as unknown as Record<string, unknown>,
    metadata: buildCustomerActionAuditMetadata(ctx, {
      stripe_customer_id: stripeCustomerId,
      stripe_subscription_id: stripeSubscriptionId,
    }),
  });

  return actionSuccess({
    profile,
    message: 'Kunden återaktiverades på befintlig profil.',
  });
}
