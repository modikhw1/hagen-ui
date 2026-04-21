import 'server-only';

import { logCustomerInvited } from '@/lib/activity/logger';
import { recordAuditLog } from '@/lib/admin/audit-log';
import { syncCustomerAssignmentFromProfile } from '@/lib/admin/cm-assignments';
import { buildCustomerPayload } from '@/lib/admin/customer-detail/load';
import { syncOperationalSubscriptionState } from '@/lib/admin/subscription-operational-sync';
import type { CustomerAction } from '@/lib/admin/schemas/customer-actions';
import { deriveTikTokHandle, toCanonicalTikTokProfileUrl } from '@/lib/tiktok/profile';
import { resolveAccountManagerAssignment } from '@/lib/studio/account-manager';
import { getAppUrl } from '@/lib/url/public';
import { jsonError } from '@/lib/server/api-response';
import type { TablesUpdate } from '@/types/database';
import {
  type CreatedStripeArtifacts,
  createStripeArtifacts,
  persistPendingStripeAttachments,
} from './send-invite-support';
import type { ActionResult, AdminActionContext } from './types';

type SendInviteInput = Extract<CustomerAction, { action: 'send_invite' }>;

export async function handleSendInvite(
  ctx: AdminActionContext,
  input: SendInviteInput,
): Promise<ActionResult> {
  const assignment = await resolveAccountManagerAssignment(
    ctx.supabaseAdmin,
    input.account_manager,
  );
  const canonicalTikTokProfileUrl = input.tiktok_profile_url
    ? toCanonicalTikTokProfileUrl(input.tiktok_profile_url)
    : null;
  const tiktokHandle = input.tiktok_profile_url
    ? deriveTikTokHandle(input.tiktok_profile_url)
    : null;

  if (input.tiktok_profile_url && (!canonicalTikTokProfileUrl || !tiktokHandle)) {
    return jsonError(
      'Ogiltig TikTok-profil. Anvand en profil-URL eller @handle.',
      400,
    );
  }

  const attemptNonce = Number(ctx.beforeProfile?.invite_attempt_nonce ?? 0) + 1;
  const { error: nonceError } = await ctx.supabaseAdmin
    .from('customer_profiles')
    .update({ invite_attempt_nonce: attemptNonce })
    .eq('id', ctx.id);

  if (nonceError) {
    return jsonError(nonceError.message, 500);
  }

  let artifacts: CreatedStripeArtifacts;
  try {
    artifacts = await createStripeArtifacts(ctx, input, attemptNonce);
  } catch (error) {
    return jsonError(
      error instanceof Error
        ? error.message
        : 'Kunde inte skapa Stripe-prenumeration',
      502,
    );
  }

  const { error: inviteError } = await ctx.supabaseAdmin.auth.admin.inviteUserByEmail(
    input.contact_email,
    {
      data: {
        business_name: input.business_name,
        customer_profile_id: ctx.id,
        stripe_customer_id: artifacts.customerId,
        stripe_subscription_id: artifacts.subscriptionId,
      },
      redirectTo: `${getAppUrl()}/auth/callback`,
    },
  );

  if (inviteError) {
    await persistPendingStripeAttachments(
      ctx,
      artifacts,
      attemptNonce,
      'invite_recovery',
      inviteError.message,
    );
    return jsonError(inviteError.message, 500);
  }

  const updateData: TablesUpdate<'customer_profiles'> = {
    status: 'invited',
    invited_at: new Date().toISOString(),
    stripe_customer_id: artifacts.customerId,
    stripe_subscription_id: artifacts.subscriptionId,
    invoice_text: input.invoice_text || null,
    scope_items: input.scope_items || [],
    subscription_interval: input.subscription_interval,
    pricing_status: input.pricing_status === 'unknown' ? 'unknown' : 'fixed',
    contract_start_date: input.contract_start_date || null,
    billing_day_of_month: Math.max(1, Math.min(28, Number(input.billing_day_of_month) || 25)),
    first_invoice_behavior: input.first_invoice_behavior,
    upcoming_monthly_price: Number(input.upcoming_monthly_price) || null,
    upcoming_price_effective_date: input.upcoming_price_effective_date || null,
    customer_contact_name: input.customer_contact_name || null,
    account_manager: assignment.accountManager,
    account_manager_profile_id: assignment.accountManagerProfileId,
    tiktok_profile_url: canonicalTikTokProfileUrl,
    tiktok_handle: tiktokHandle,
  };

  const { data: profile, error: updateError } = await ctx.supabaseAdmin
    .from('customer_profiles')
    .update(updateData)
    .eq('id', ctx.id)
    .select()
    .single();

  if (updateError) {
    await persistPendingStripeAttachments(
      ctx,
      artifacts,
      attemptNonce,
      'profile_update_failed',
      updateError.message,
    );
    await recordAuditLog(ctx.supabaseAdmin, {
      actorUserId: ctx.user.id,
      actorEmail: ctx.user.email,
      actorRole: ctx.user.role,
      action: 'admin.invite.partial_failure',
      entityType: 'customer_profile',
      entityId: ctx.id,
      beforeState: ctx.beforeProfile,
      metadata: {
        invite_attempt_nonce: attemptNonce,
        stripe_customer_id: artifacts.customerId,
        stripe_subscription_id: artifacts.subscriptionId,
        stripe_product_id: artifacts.productId,
        stripe_price_id: artifacts.priceId,
        error: updateError.message,
      },
    });
    return jsonError(updateError.message, 500);
  }

  await logCustomerInvited(
    ctx.user.id,
    ctx.user.email || 'unknown',
    ctx.id,
    input.business_name,
    input.contact_email,
  );
  await syncCustomerAssignmentFromProfile({
    supabaseAdmin: ctx.supabaseAdmin,
    customerProfileId: ctx.id,
  });
  await syncOperationalSubscriptionState({
    supabaseAdmin: ctx.supabaseAdmin,
    customerProfileId: ctx.id,
  });
  await recordAuditLog(ctx.supabaseAdmin, {
    actorUserId: ctx.user.id,
    actorEmail: ctx.user.email,
    actorRole: ctx.user.role,
    action: 'admin.customer.invited',
    entityType: 'customer_profile',
    entityId: ctx.id,
    beforeState: ctx.beforeProfile,
    afterState: profile as unknown as Record<string, unknown>,
    metadata: {
      stripe_customer_id: artifacts.customerId,
      stripe_subscription_id: artifacts.subscriptionId,
      invite_attempt_nonce: attemptNonce,
    },
  });

  return {
    ...buildCustomerPayload(profile),
    message: 'Inbjudan skickades.',
    stripe_customer_id: artifacts.customerId,
    stripe_subscription_id: artifacts.subscriptionId,
  };
}
