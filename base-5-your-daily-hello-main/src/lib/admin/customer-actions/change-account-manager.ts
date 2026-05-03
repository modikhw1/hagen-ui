import 'server-only';

import { recordAuditLog } from '@/lib/admin/audit-log';
import { changeCustomerAssignment } from '@/lib/admin/cm-assignments';
import type { CustomerAction } from '@/lib/admin/schemas/customer-actions';
import {
  actionSuccess,
  buildCustomerActionAuditMetadata,
} from './shared';
import type { ActionResult, AdminActionContext } from './types';

type ChangeAccountManagerInput = Extract<
  CustomerAction,
  { action: 'change_account_manager' }
>;

export async function handleChangeAccountManager(
  ctx: AdminActionContext,
  input: ChangeAccountManagerInput,
): Promise<ActionResult> {
  const assignment = await changeCustomerAssignment({
    supabaseAdmin: ctx.supabaseAdmin,
    customerProfileId: ctx.id,
    nextCmId: input.cm_id ?? null,
    effectiveDate: input.effective_date,
    handoverNote: input.handover_note ?? null,
  });
  const profile = assignment.profile ?? (ctx.beforeProfile as unknown as Record<string, unknown>);

  await recordAuditLog(ctx.supabaseAdmin, {
    actorUserId: ctx.user.id,
    actorEmail: ctx.user.email,
    actorRole: ctx.user.role,
    action:
      assignment.status === 'scheduled'
        ? 'admin.customer.cm_change_scheduled'
        : 'admin.customer.cm_changed',
    entityType: 'customer_profile',
    entityId: ctx.id,
    beforeState: ctx.beforeProfile,
    afterState: profile as unknown as Record<string, unknown>,
    metadata: buildCustomerActionAuditMetadata(ctx, {
      effective_date: assignment.effectiveDate,
      next_cm_id: assignment.nextCmId,
      handover_note: input.handover_note ?? null,
    }),
  });

  return actionSuccess({
    profile,
    assignment: {
      status: assignment.status,
      effectiveDate: assignment.effectiveDate,
      nextCmId: assignment.nextCmId,
    },
  });
}
