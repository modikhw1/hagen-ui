import { NextRequest } from 'next/server';
import { z } from 'zod';
import { handleChangeAccountManager } from '@/lib/admin/customer-actions/change-account-manager';
import {
  runCustomerActionRoute,
  type CustomerActionRouteParams,
} from '@/lib/admin/customer-actions/route-helpers';

const reassignSchema = z
  .object({
    cm_id: z.string().uuid().optional().nullable(),
    effective_date: z.string().trim().min(1),
    handover_note: z.string().trim().max(1000).optional().nullable(),
  })
  .strict();

export function POST(request: NextRequest, context: CustomerActionRouteParams) {
  return runCustomerActionRoute(
    request,
    context,
    (ctx, payload) =>
      handleChangeAccountManager(ctx, {
        action: 'change_account_manager',
        cm_id: payload.cm_id ?? null,
        effective_date: payload.effective_date,
        handover_note: payload.handover_note ?? null,
      }),
    {
      schema: reassignSchema,
      requiredScope: 'customers.write',
      actionName: 'change_account_manager',
    },
  );
}
