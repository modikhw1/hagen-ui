import 'server-only';

import type { CustomerAction } from '@/lib/admin/schemas/customer-actions';
import { jsonError } from '@/lib/server/api-response';
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
    return jsonError(error.message, 500);
  }

  return {
    message:
      'Kunden har redan ett konto och kan logga in for att fortsatta.',
    already_registered: true,
  };
}
