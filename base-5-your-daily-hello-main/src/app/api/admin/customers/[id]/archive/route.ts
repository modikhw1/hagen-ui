import { NextRequest } from 'next/server';
import { SERVER_COPY } from '@/lib/admin/copy/server-errors';
import { handleArchiveCustomer } from '@/lib/admin/customer-actions/archive';
import {
  runCustomerDeleteRoute,
  type CustomerActionRouteParams,
} from '@/lib/admin/customer-actions/route-helpers';

export function DELETE(request: NextRequest, context: CustomerActionRouteParams) {
  return runCustomerDeleteRoute(request, context, handleArchiveCustomer, {
    requiredScope: 'customers.archive',
    scopeMessage: SERVER_COPY.superAdminOnly,
    actionName: 'archive_customer',
  });
}
