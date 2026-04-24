import { NextRequest } from 'next/server';
import { z } from 'zod';
import { SERVER_COPY } from '@/lib/admin/copy/server-errors';
import { handleCancelSubscription } from '@/lib/admin/customer-actions/cancel-subscription';
import {
  runCustomerActionRoute,
  type CustomerActionRouteParams,
} from '@/lib/admin/customer-actions/route-helpers';

const cancelSchema = z
  .object({
    mode: z.enum(['end_of_period', 'immediate', 'immediate_with_credit']).default('end_of_period'),
    credit_amount_ore: z.number().int().min(0).optional().nullable(),
    invoice_id: z.string().uuid().optional().nullable(),
    memo: z.string().trim().max(1000).optional().nullable(),
  })
  .strict();

export function POST(request: NextRequest, context: CustomerActionRouteParams) {
  return runCustomerActionRoute(
    request,
    context,
    (ctx, payload) =>
      handleCancelSubscription(ctx, {
        action: 'cancel_subscription',
        mode: payload.mode,
        credit_amount_ore: payload.credit_amount_ore ?? null,
        invoice_id: payload.invoice_id ?? null,
        memo: payload.memo ?? null,
      }),
    {
      schema: cancelSchema,
      requiredScope: 'super_admin',
      scopeMessage: SERVER_COPY.superAdminOnly,
      actionName: 'cancel_subscription',
    },
  );
}
