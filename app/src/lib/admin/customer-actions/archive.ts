import 'server-only';

import { requireAdminScope } from '@/lib/auth/api-auth';
import { recordAuditLog } from '@/lib/admin/audit-log';
import { archiveStripeCustomer } from '@/lib/stripe/admin-billing';
import { buildCustomerActionAuditMetadata } from './shared';
import type { ActionResult, AdminActionContext } from './types';

export async function handleArchiveCustomer(
  ctx: AdminActionContext,
): Promise<ActionResult> {
  requireAdminScope(
    ctx.user,
    'super_admin',
    'Endast super-admin kan arkivera kunder',
  );

  const cleanup = await archiveStripeCustomer({
    supabaseAdmin: ctx.supabaseAdmin,
    stripeClient: ctx.stripeClient,
    profileId: ctx.id,
  });

  const { data, error } = await ctx.supabaseAdmin
    .from('customer_profiles')
    .update({ status: 'archived' })
    .eq('id', ctx.id)
    .select()
    .single();

  if (error) {
    throw new Error(error.message);
  }

  await recordAuditLog(ctx.supabaseAdmin, {
    actorUserId: ctx.user.id,
    actorEmail: ctx.user.email,
    actorRole: ctx.user.role,
    action: 'admin.customer.archived',
    entityType: 'customer_profile',
    entityId: ctx.id,
    beforeState: ctx.beforeProfile,
    afterState: data as unknown as Record<string, unknown>,
    metadata: buildCustomerActionAuditMetadata(ctx, { cleanup }),
  });

  return {
    success: true,
    message: 'Kunden arkiverades.',
    customer: data,
    cleanup,
  };
}
