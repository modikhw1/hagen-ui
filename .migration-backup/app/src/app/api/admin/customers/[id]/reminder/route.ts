import { NextRequest } from 'next/server';
import { z } from 'zod';
import { handleSendReminder } from '@/lib/admin/customer-actions/send-reminder';
import {
  runCustomerActionRoute,
  type CustomerActionRouteParams,
} from '@/lib/admin/customer-actions/route-helpers';

const reminderSchema = z.object({}).strict();

export function POST(request: NextRequest, context: CustomerActionRouteParams) {
  return runCustomerActionRoute(
    request,
    context,
    (ctx) =>
      handleSendReminder(ctx, {
        action: 'send_reminder',
      }),
    {
      schema: reminderSchema,
      requiredScope: 'customers.write',
      actionName: 'send_reminder',
    },
  );
}
