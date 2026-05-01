import 'server-only';

import { recordAuditLog } from '@/lib/admin/audit-log';
import { recordCustomerInviteToken } from '@/lib/admin/customer-billing-store';
import { buildTikTokProfileLinkPatch } from '@/lib/tiktok/customer-profile-link';
import { triggerInitialTikTokSync } from '@/lib/tiktok/trigger-initial-sync';
import type { TablesUpdate } from '@/types/database';
import {
  persistPendingStripeAttachments,
  type CreatedStripeArtifacts,
} from '../send-invite-support';
import {
  actionFailure,
  buildCustomerActionAuditMetadata,
} from '../shared';
import type { AdminActionContext } from '../types';
import type {
  PersistedInvite,
  PreparedInvite,
  SendInviteInput,
  SendInviteStepResult,
} from './types';

function buildProfileUpdateData(
  input: SendInviteInput,
  prepared: PreparedInvite,
  artifacts: CreatedStripeArtifacts,
  previousTikTokProfileUrl: string | null,
): TablesUpdate<'customer_profiles'> {
  const tiktokLinkPatch = buildTikTokProfileLinkPatch({
    input: prepared.canonicalTikTokProfileUrl,
    previousProfileUrl: previousTikTokProfileUrl,
  });

  return {
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
    account_manager: prepared.assignment.accountManager,
    account_manager_profile_id: prepared.assignment.accountManagerProfileId,
    ...(tiktokLinkPatch.ok ? tiktokLinkPatch.patch : {}),
  };
}

export async function persistInviteProfile(
  ctx: AdminActionContext,
  input: SendInviteInput,
  prepared: PreparedInvite,
  artifacts: CreatedStripeArtifacts,
): Promise<SendInviteStepResult<PersistedInvite>> {
  const updateData = buildProfileUpdateData(
    input,
    prepared,
    artifacts,
    typeof ctx.beforeProfile?.tiktok_profile_url === 'string'
      ? ctx.beforeProfile.tiktok_profile_url
      : null,
  );
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
      prepared.attemptNonce,
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
      metadata: buildCustomerActionAuditMetadata(ctx, {
        invite_attempt_nonce: prepared.attemptNonce,
        stripe_customer_id: artifacts.customerId,
        stripe_subscription_id: artifacts.subscriptionId,
        stripe_product_id: artifacts.productId,
        stripe_price_id: artifacts.priceId,
        error: updateError.message,
      }),
    });

    const failed = actionFailure({ error: updateError.message, statusCode: 500 });
    return { ok: false, error: failed.error, statusCode: failed.statusCode ?? 500 };
  }

  await recordCustomerInviteToken({
    supabaseAdmin: ctx.supabaseAdmin,
    customerId: ctx.id,
    email: input.contact_email,
    createdBy: ctx.user.id,
    metadata: {
      provider: 'supabase_invite_by_email',
      stripe_customer_id: artifacts.customerId,
      stripe_subscription_id: artifacts.subscriptionId,
      invite_attempt_nonce: prepared.attemptNonce,
    },
  });

  await triggerInitialTikTokSync({
    supabaseAdmin: ctx.supabaseAdmin,
    customerId: ctx.id,
    tiktokHandle: typeof profile.tiktok_handle === 'string' ? profile.tiktok_handle : null,
    lastHistorySyncAt:
      typeof profile.last_history_sync_at === 'string' ? profile.last_history_sync_at : null,
    source: 'invite',
  });

  return {
    ok: true,
    value: {
      profile,
      updateData,
    },
  };
}
