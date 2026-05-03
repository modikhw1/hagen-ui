import { NextRequest } from 'next/server';
import { handleCancelInvite } from '@/lib/admin/customer-actions/cancel-invite';
import {
  runCustomerActionRoute,
  type CustomerActionRouteParams,
} from '@/lib/admin/customer-actions/route-helpers';

export function POST(request: NextRequest, context: CustomerActionRouteParams) {
  return runCustomerActionRoute(
    request,
    context,
    async (ctx) => handleCancelInvite(ctx),
    {
      buildPayload: () => ({ action: 'cancel_invite' as const }),
      requiredScope: 'customers.invite',
    },
  );
}
