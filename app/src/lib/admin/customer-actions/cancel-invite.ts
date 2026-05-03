import 'server-only';

import { recordAuditLog } from '@/lib/admin/audit-log';
import { SERVER_COPY } from '@/lib/admin/copy/server-errors';
import {
  actionFailure,
  actionSuccess,
  buildCustomerActionAuditMetadata,
} from './shared';
import type { ActionResult, AdminActionContext } from './types';

async function findAuthUserByEmail(
  ctx: AdminActionContext,
  email: string,
) {
  const normalizedTarget = email.trim().toLowerCase();
  const maxPages = 10;
  const perPage = 200;

  for (let page = 1; page <= maxPages; page += 1) {
    const { data, error } = await ctx.supabaseAdmin.auth.admin.listUsers({ page, perPage });
    if (error) throw error;

    const users = data?.users || [];
    if (users.length === 0) break;

    const match = users.find(
      (candidate) => (candidate.email || '').trim().toLowerCase() === normalizedTarget,
    );
    if (match) {
      return match;
    }

    if (users.length < perPage) break;
  }

  return null;
}

export async function handleCancelInvite(
  ctx: AdminActionContext,
): Promise<ActionResult> {
  if (!ctx.beforeProfile) {
    return actionFailure({ error: SERVER_COPY.customerNotFound, statusCode: 404 });
  }

  const profile = ctx.beforeProfile as Record<string, unknown>;
  const lifecycle = typeof profile.lifecycle_state === 'string' ? profile.lifecycle_state : null;
  const status = typeof profile.status === 'string' ? profile.status : null;
  const email = typeof profile.contact_email === 'string' ? profile.contact_email : null;

  if (lifecycle !== 'invited' && status !== 'invited') {
    return actionFailure({
      error: 'Det finns ingen aktiv inbjudan att avbryta för den här kunden.',
      statusCode: 409,
    });
  }

  if (!email) {
    return actionFailure({
      error: 'Profilen saknar e-postadress.',
      statusCode: 400,
    });
  }

  let deletedUserId: string | null = null;
  try {
    const target = await findAuthUserByEmail(ctx, email);

    if (target && !target.email_confirmed_at) {
      const { error: deleteError } = await ctx.supabaseAdmin.auth.admin.deleteUser(target.id);
      if (deleteError) throw deleteError;
      deletedUserId = target.id;
    }
  } catch (authError) {
    const message = authError instanceof Error ? authError.message : 'Okänt fel';
    return actionFailure({
      error: `Kunde inte avbryta inbjudan i auth: ${message}`,
      statusCode: 500,
    });
  }

  const { data: updatedProfile, error: updateError } = await ctx.supabaseAdmin
    .from('customer_profiles')
    .update({
      status: 'draft',
      lifecycle_state: 'draft' as never,
      invited_at: null,
    })
    .eq('id', ctx.id)
    .select()
    .single();

  if (updateError) {
    return actionFailure({
      error: `Auth-användaren togs bort men profilen kunde inte uppdateras: ${updateError.message}`,
      statusCode: 500,
    });
  }

  await recordAuditLog(ctx.supabaseAdmin, {
    actorUserId: ctx.user.id,
    actorEmail: ctx.user.email,
    actorRole: ctx.user.role,
    action: 'admin.customer.invite_cancelled',
    entityType: 'customer_profile',
    entityId: ctx.id,
    beforeState: ctx.beforeProfile,
    afterState: updatedProfile,
    metadata: buildCustomerActionAuditMetadata(ctx, {
      email,
      deleted_auth_user_id: deletedUserId,
    }),
  });

  return actionSuccess({
    profile: updatedProfile,
    message: deletedUserId
      ? 'Inbjudan avbruten och den tidigare länken är inte längre giltig.'
      : 'Inbjudan markerad som avbruten (ingen aktiv auth-användare hittades).',
  });
}
