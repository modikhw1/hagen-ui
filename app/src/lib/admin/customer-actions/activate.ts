import 'server-only';

import { recordAuditLog } from '@/lib/admin/audit-log';
import { buildCustomerPayload } from '@/lib/admin/customer-detail/load';
import type { CustomerAction } from '@/lib/admin/schemas/customer-actions';
import { jsonError } from '@/lib/server/api-response';
import { buildCustomerActionAuditMetadata } from './shared';
import type { ActionResult, AdminActionContext } from './types';

type ActivateInput = Extract<CustomerAction, { action: 'activate' }>;

export async function handleActivate(
  ctx: AdminActionContext,
  input: ActivateInput,
): Promise<ActionResult> {
  void input;
  const { data, error } = await ctx.supabaseAdmin
    .from('customer_profiles')
    .update({ status: 'active', agreed_at: new Date().toISOString() })
    .eq('id', ctx.id)
    .select()
    .single();

  if (error) {
    return jsonError(error.message, 500);
  }

  await recordAuditLog(ctx.supabaseAdmin, {
    actorUserId: ctx.user.id,
    actorEmail: ctx.user.email,
    actorRole: ctx.user.role,
    action: 'admin.customer.activated',
    entityType: 'customer_profile',
    entityId: ctx.id,
    beforeState: ctx.beforeProfile,
    afterState: data as unknown as Record<string, unknown>,
    metadata: buildCustomerActionAuditMetadata(ctx),
  });

  return buildCustomerPayload(data);
}
