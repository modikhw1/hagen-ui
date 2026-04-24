import { NextRequest } from 'next/server';
import { z } from 'zod';
import { handlePauseSubscription } from '@/lib/admin/customer-actions/pause-subscription';
import {
  runCustomerActionRoute,
  type CustomerActionRouteParams,
} from '@/lib/admin/customer-actions/route-helpers';

const pauseSchema = z
  .object({
    pause_until: z.string().trim().min(1).optional().nullable(),
  })
  .strict();

export function POST(request: NextRequest, context: CustomerActionRouteParams) {
  return runCustomerActionRoute(
    request,
    context,
    (ctx, payload) =>
      handlePauseSubscription(ctx, {
        action: 'pause_subscription',
        pause_until: payload.pause_until ?? null,
      }),
    {
      schema: pauseSchema,
      requiredScope: 'customers.write',
      actionName: 'pause_subscription',
    },
  );
}
