import 'server-only';

import { recordAuditLog } from '@/lib/admin/audit-log';
import { syncOperationalSubscriptionState } from '@/lib/admin/subscription-operational-sync';
import type { CustomerAction } from '@/lib/admin/schemas/customer-actions';
import {
  cancelCustomerSubscription,
  type SubscriptionCancellationMode,
} from '@/lib/stripe/admin-billing';
import type { ActionResult, AdminActionContext } from './types';

type CancelSubscriptionInput = Extract<
  CustomerAction,
  { action: 'cancel_subscription' }
>;

export async function handleCancelSubscription(
  ctx: AdminActionContext,
  input: CancelSubscriptionInput,
): Promise<ActionResult> {
  const result = await cancelCustomerSubscription({
    supabaseAdmin: ctx.supabaseAdmin,
    stripeClient: ctx.stripeClient,
    profileId: ctx.id,
    mode: input.mode as SubscriptionCancellationMode,
    creditAmountOre: input.credit_amount_ore ?? null,
    invoiceId: input.invoice_id ?? null,
    memo: input.memo ?? null,
    requestId: ctx.requestId,
  });

  await ctx.supabaseAdmin
    .from('customer_profiles')
    .update({
      paused_until: null,
    })
    .eq('id', ctx.id);

  await syncOperationalSubscriptionState({
    supabaseAdmin: ctx.supabaseAdmin,
    customerProfileId: ctx.id,
  });
  await recordAuditLog(ctx.supabaseAdmin, {
    actorUserId: ctx.user.id,
    actorEmail: ctx.user.email,
    actorRole: ctx.user.role,
    action: 'admin.customer.subscription_cancelled',
    entityType: 'subscription',
    entityId: String(ctx.beforeProfile?.stripe_subscription_id ?? ctx.id),
    beforeState: ctx.beforeProfile,
    metadata: {
      mode: input.mode,
      credit_amount_ore: input.credit_amount_ore ?? null,
      credit_note_id: result.creditNote?.id ?? null,
      idempotency_key: ctx.requestId,
    },
  });

  return { success: true, ...result };
}
