import 'server-only';

import { logCustomerInvited } from '@/lib/activity/logger';
import { recordAuditLog } from '@/lib/admin/audit-log';
import { syncCustomerAssignmentFromProfile } from '@/lib/admin/cm-assignments';
import { syncOperationalSubscriptionState } from '@/lib/admin/subscription-operational-sync';
import type { CreatedStripeArtifacts } from '../send-invite-support';
import { buildCustomerActionAuditMetadata } from '../shared';
import type { AdminActionContext } from '../types';
import type { PreparedInvite, SendInviteInput } from './types';

export async function finalizeSendInvite(params: {
  ctx: AdminActionContext;
  input: SendInviteInput;
  prepared: PreparedInvite;
  artifacts: CreatedStripeArtifacts;
  profile: Record<string, unknown>;
}) {
  const { ctx, input, prepared, artifacts, profile } = params;
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
    afterState: profile,
    metadata: buildCustomerActionAuditMetadata(ctx, {
      stripe_customer_id: artifacts.customerId,
      stripe_subscription_id: artifacts.subscriptionId,
      invite_attempt_nonce: prepared.attemptNonce,
    }),
  });
}
