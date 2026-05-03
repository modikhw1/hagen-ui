import 'server-only';

import { recordAuditLog } from '@/lib/admin/audit-log';
import { SERVER_COPY } from '@/lib/admin/copy/server-errors';
import { getAppUrl } from '@/lib/url/public';
import {
  actionFailure,
  actionSuccess,
  buildCustomerActionAuditMetadata,
} from './shared';
import type { ActionResult, AdminActionContext } from './types';

export async function handleCopyInviteLink(
  ctx: AdminActionContext,
): Promise<ActionResult> {
  if (!ctx.beforeProfile) {
    return actionFailure({ error: SERVER_COPY.customerNotFound, statusCode: 404 });
  }

  const profile = ctx.beforeProfile as Record<string, unknown>;
  const email = typeof profile.contact_email === 'string' ? profile.contact_email : null;
  if (!email) {
    return actionFailure({
      error: 'Profilen saknar e-postadress.',
      statusCode: 400,
    });
  }

  const { data, error } = await ctx.supabaseAdmin.auth.admin.generateLink({
    type: 'invite',
    email,
    options: {
      redirectTo: `${getAppUrl()}/auth/callback`,
    },
  });

  if (error) {
    return actionFailure({
      error: `Kunde inte generera invite-länk: ${error.message}`,
      statusCode: 500,
    });
  }

  const actionLink =
    data?.properties && typeof data.properties.action_link === 'string'
      ? data.properties.action_link
      : null;

  if (!actionLink) {
    return actionFailure({
      error: 'Ingen invite-länk returnerades från auth-tjänsten.',
      statusCode: 500,
    });
  }

  await recordAuditLog(ctx.supabaseAdmin, {
    actorUserId: ctx.user.id,
    actorEmail: ctx.user.email,
    actorRole: ctx.user.role,
    action: 'admin.customer.invite_link_copied',
    entityType: 'customer_profile',
    entityId: ctx.id,
    beforeState: ctx.beforeProfile,
    afterState: ctx.beforeProfile,
    metadata: buildCustomerActionAuditMetadata(ctx, { email }),
  });

  return actionSuccess({
    invite_link: actionLink,
    email,
    message: 'Invite-länk genererad. Kopiera och skicka till kunden.',
  });
}
