import 'server-only';

import { recordAuditLog } from '@/lib/admin/audit-log';
import { syncOperationalSubscriptionState } from '@/lib/admin/subscription-operational-sync';
import type { CustomerAction } from '@/lib/admin/schemas/customer-actions';
import {
  cancelCustomerSubscription,
  type SubscriptionCancellationMode,
} from '@/lib/stripe/admin-billing';
import { getAppUrl } from '@/lib/url/public';
import { withCustomerActionLock } from './lock';
import { actionSuccess, buildCustomerActionAuditMetadata } from './shared';
import type { ActionResult, AdminActionContext } from './types';

type CancelSubscriptionInput = Extract<
  CustomerAction,
  { action: 'cancel_subscription' }
>;

export async function handleCancelSubscription(
  ctx: AdminActionContext,
  input: CancelSubscriptionInput,
): Promise<ActionResult> {
  return withCustomerActionLock(ctx, 'billing', async () => {
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
      metadata: buildCustomerActionAuditMetadata(ctx, {
        mode: input.mode,
        credit_amount_ore: input.credit_amount_ore ?? null,
        credit_note_id: result.creditNote?.id ?? null,
        idempotency_key: ctx.requestId,
      }),
    });

    let customerPortalUrl: string | null = null;
    if (
      ctx.stripeClient &&
      typeof ctx.beforeProfile?.stripe_customer_id === 'string' &&
      ctx.beforeProfile.stripe_customer_id
    ) {
      try {
        const portalSession = await ctx.stripeClient.billingPortal.sessions.create({
          customer: ctx.beforeProfile.stripe_customer_id,
          return_url: `${getAppUrl()}/admin/customers/${ctx.id}/billing`,
          ...(typeof ctx.beforeProfile?.stripe_subscription_id === 'string' &&
          ctx.beforeProfile.stripe_subscription_id
            ? {
                flow_data: {
                  type: 'subscription_cancel' as const,
                  subscription_cancel: {
                    subscription: ctx.beforeProfile.stripe_subscription_id,
                  },
                },
              }
            : {}),
        });
        customerPortalUrl = portalSession.url;
      } catch {
        customerPortalUrl = null;
      }
    }

    return actionSuccess({
      ...result,
      customer_portal_url: customerPortalUrl,
    });
  });
}
