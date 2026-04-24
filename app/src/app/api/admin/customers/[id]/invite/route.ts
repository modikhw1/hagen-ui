import { NextRequest } from 'next/server';
import { z } from 'zod';
import { handleResendInvite } from '@/lib/admin/customer-actions/resend-invite';
import { handleSendInvite } from '@/lib/admin/customer-actions/send-invite';
import {
  runCustomerActionRoute,
  type CustomerActionRouteParams,
} from '@/lib/admin/customer-actions/route-helpers';
import { customerInviteSchema } from '@/lib/schemas/customer';

const inviteRouteSchema = customerInviteSchema.partial().strict();
type InviteRoutePayload = z.infer<typeof inviteRouteSchema> & {
  action: 'send_invite' | 'resend_invite';
};

/** @deprecated Prefer app/admin/_actions/billing.resendInvite for new callers. */
export function POST(request: NextRequest, context: CustomerActionRouteParams) {
  return runCustomerActionRoute(
    request,
    context,
    async (ctx, payload: InviteRoutePayload) => {
      if (
        payload.action === 'resend_invite' ||
        !payload.contact_email ||
        !payload.business_name
      ) {
        return handleResendInvite(ctx, { action: 'resend_invite' });
      }

      return handleSendInvite(ctx, {
        action: 'send_invite',
        business_name: payload.business_name,
        contact_email: payload.contact_email,
        customer_contact_name: payload.customer_contact_name ?? null,
        phone: payload.phone ?? null,
        tiktok_profile_url: payload.tiktok_profile_url ?? null,
        account_manager: payload.account_manager ?? null,
        monthly_price: payload.monthly_price ?? 0,
        pricing_status: payload.pricing_status ?? 'fixed',
        contract_start_date: payload.contract_start_date ?? null,
        billing_day_of_month: payload.billing_day_of_month ?? 25,
        first_invoice_behavior: payload.first_invoice_behavior ?? 'prorated',
        waive_days_until_billing: payload.waive_days_until_billing ?? false,
        upcoming_monthly_price: payload.upcoming_monthly_price ?? null,
        upcoming_price_effective_date: payload.upcoming_price_effective_date ?? null,
        subscription_interval: payload.subscription_interval ?? 'month',
        invoice_text: payload.invoice_text ?? null,
        scope_items: payload.scope_items ?? [],
      });
    },
    {
      schema: inviteRouteSchema,
      buildPayload: (payload) => ({
        ...payload,
        action:
          payload.contact_email && payload.business_name
            ? ('send_invite' as const)
            : ('resend_invite' as const),
      }),
      requiredScope: 'customers.invite',
    },
  );
}
