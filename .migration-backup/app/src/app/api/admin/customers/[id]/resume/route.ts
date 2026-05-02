import { NextRequest } from 'next/server';
import { z } from 'zod';
import { handleResumeSubscription } from '@/lib/admin/customer-actions/resume-subscription';
import {
  runCustomerActionRoute,
  type CustomerActionRouteParams,
} from '@/lib/admin/customer-actions/route-helpers';

const resumeSchema = z.object({}).strict();

export function POST(request: NextRequest, context: CustomerActionRouteParams) {
  return runCustomerActionRoute(
    request,
    context,
    (ctx) =>
      handleResumeSubscription(ctx, {
        action: 'resume_subscription',
      }),
    {
      schema: resumeSchema,
      requiredScope: 'customers.write',
      actionName: 'resume_subscription',
    },
  );
}
