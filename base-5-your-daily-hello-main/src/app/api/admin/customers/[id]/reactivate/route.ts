import { NextRequest } from 'next/server';
import { z } from 'zod';
import { handleReactivate } from '@/lib/admin/customer-actions/reactivate';
import {
  runCustomerActionRoute,
  type CustomerActionRouteParams,
} from '@/lib/admin/customer-actions/route-helpers';

const reactivateSchema = z.object({}).strict();

export function POST(request: NextRequest, context: CustomerActionRouteParams) {
  return runCustomerActionRoute(
    request,
    context,
    (ctx) =>
      handleReactivate(ctx, {
        action: 'reactivate_archive',
      }),
    {
      schema: reactivateSchema,
      requiredScope: 'customers.write',
      actionName: 'reactivate_archive',
    },
  );
}
