import 'server-only';

import { recordAuditLog } from '@/lib/admin/audit-log';
import { SERVER_COPY } from '@/lib/admin/copy/server-errors';
import { syncOperationalSubscriptionState } from '@/lib/admin/subscription-operational-sync';
import { profileToInvitePayload } from '@/lib/admin/customer-detail/load';
import type { CustomerAction } from '@/lib/admin/schemas/customer-actions';
import { sendCustomerInvite } from '@/lib/customers/invite';
import { getAppUrl } from '@/lib/url/public';
import {
  actionFailure,
  actionSuccess,
  buildCustomerActionAuditMetadata,
} from './shared';
import type { ActionResult, AdminActionContext } from './types';

type ResendInviteInput = Extract<CustomerAction, { action: 'resend_invite' }>;

export async function handleResendInvite(
  ctx: AdminActionContext,
  input: ResendInviteInput,
): Promise<ActionResult> {
  void input;
  if (!ctx.beforeProfile) {
    return actionFailure({ error: SERVER_COPY.customerNotFound, statusCode: 404 });
  }

  const inviteResult = await sendCustomerInvite({
    supabaseAdmin: ctx.supabaseAdmin,
    stripeClient: ctx.stripeClient,
    profileId: ctx.id,
    actorUserId: ctx.user.id,
    payload: profileToInvitePayload(ctx.beforeProfile),
    appUrl: getAppUrl(),
  });

  if (!inviteResult.ok) {
    return actionFailure({
      error: inviteResult.error,
      statusCode: inviteResult.status,
    });
  }

  await syncOperationalSubscriptionState({
    supabaseAdmin: ctx.supabaseAdmin,
    customerProfileId: ctx.id,
  });
  await recordAuditLog(ctx.supabaseAdmin, {
    actorUserId: ctx.user.id,
    actorEmail: ctx.user.email,
    actorRole: ctx.user.role,
    action: 'admin.customer.invite_resent',
    entityType: 'customer_profile',
    entityId: ctx.id,
    beforeState: ctx.beforeProfile,
    afterState: inviteResult.profile,
    metadata: buildCustomerActionAuditMetadata(ctx, {
      stripe_customer_id: inviteResult.stripeCustomerId,
      stripe_subscription_id: inviteResult.stripeSubscriptionId,
    }),
  });

  return actionSuccess({
    profile: inviteResult.profile,
    message: 'Ny invite skickades.',
  });
}
