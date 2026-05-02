import { NextRequest } from 'next/server';
import { z } from 'zod';
import { handleActivate } from '@/lib/admin/customer-actions/activate';
import {
  runCustomerActionRoute,
  type CustomerActionRouteParams,
} from '@/lib/admin/customer-actions/route-helpers';

const activateSchema = z.object({}).strict();

export function POST(request: NextRequest, context: CustomerActionRouteParams) {
  return runCustomerActionRoute(
    request,
    context,
    (ctx) =>
      handleActivate(ctx, {
        action: 'activate',
      }),
    {
      schema: activateSchema,
      requiredScope: 'customers.write',
      actionName: 'activate',
    },
  );
}
