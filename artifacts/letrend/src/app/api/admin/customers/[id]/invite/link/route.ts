import { NextRequest } from 'next/server';
import { handleCopyInviteLink } from '@/lib/admin/customer-actions/copy-invite-link';
import {
  runCustomerActionRoute,
  type CustomerActionRouteParams,
} from '@/lib/admin/customer-actions/route-helpers';

export function POST(request: NextRequest, context: CustomerActionRouteParams) {
  return runCustomerActionRoute(
    request,
    context,
    async (ctx) => handleCopyInviteLink(ctx),
    {
      actionName: 'copy_invite_link',
      requiredScope: 'customers.invite',
    },
  );
}
