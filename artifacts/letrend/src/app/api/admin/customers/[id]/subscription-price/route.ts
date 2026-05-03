import { NextRequest } from 'next/server';
import { SERVER_COPY } from '@/lib/admin/copy/server-errors';
import { handleChangeSubscriptionPrice } from '@/lib/admin/customer-actions/change-subscription-price';
import {
  runCustomerActionRoute,
  type CustomerActionRouteParams,
} from '@/lib/admin/customer-actions/route-helpers';
import { subscriptionPriceChangeSchema } from '@/lib/schemas/billing';

/** @deprecated Prefer app/admin/_actions/billing.changeSubscriptionPrice for new callers. */
export function POST(request: NextRequest, context: CustomerActionRouteParams) {
  return runCustomerActionRoute(
    request,
    context,
    (ctx, payload) =>
      handleChangeSubscriptionPrice(ctx, {
        action: 'change_subscription_price',
        monthly_price: payload.monthly_price,
        mode: payload.mode,
      }),
    {
      schema: subscriptionPriceChangeSchema,
      requiredScope: 'super_admin',
      scopeMessage: SERVER_COPY.superAdminOnly,
      actionName: 'change_subscription_price',
    },
  );
}
