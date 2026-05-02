import 'server-only';

import { recordAuditLog } from '@/lib/admin/audit-log';
import type { CustomerAction } from '@/lib/admin/schemas/customer-actions';
import {
  actionFailure,
  actionSuccess,
  buildCustomerActionAuditMetadata,
} from './shared';
import type { ActionResult, AdminActionContext } from './types';

type SendReminderInput = Extract<CustomerAction, { action: 'send_reminder' }>;

export async function handleSendReminder(
  ctx: AdminActionContext,
  input: SendReminderInput,
): Promise<ActionResult> {
  void input;
  const { error } = await ctx.supabaseAdmin
    .from('customer_profiles')
    .select('id')
    .eq('id', ctx.id)
    .single();

  if (error) {
    return actionFailure({ error: error.message, statusCode: 500 });
  }

  await recordAuditLog(ctx.supabaseAdmin, {
    actorUserId: ctx.user.id,
    actorEmail: ctx.user.email,
    actorRole: ctx.user.role,
    action: 'admin.customer.reminder_checked',
    entityType: 'customer_profile',
    entityId: ctx.id,
    beforeState: ctx.beforeProfile,
    metadata: buildCustomerActionAuditMetadata(ctx),
  });

  return actionSuccess({
    message:
      'Kunden har redan ett konto och kan logga in för att fortsätta.',
    already_registered: true,
  });
}
