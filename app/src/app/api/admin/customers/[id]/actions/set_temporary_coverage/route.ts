import { NextRequest } from 'next/server';
import { z } from 'zod';
import { handleSetTemporaryCoverage } from '@/lib/admin/customer-actions/set-temporary-coverage';
import {
  runCustomerActionRoute,
  type CustomerActionRouteParams,
} from '@/lib/admin/customer-actions/route-helpers';

const setTemporaryCoverageSchema = z
  .object({
    covering_cm_id: z.string().uuid(),
    starts_on: z.string().trim().min(1),
    ends_on: z.string().trim().min(1),
    note: z.string().trim().max(1000).optional().nullable(),
    compensation_mode: z.enum(['covering_cm', 'primary_cm']).default('covering_cm'),
  })
  .refine((payload) => payload.ends_on >= payload.starts_on, {
    message: 'Slutdatum kan inte vara före startdatum',
    path: ['ends_on'],
  })
  .strict();

export function POST(request: NextRequest, context: CustomerActionRouteParams) {
  return runCustomerActionRoute(
    request,
    context,
    (ctx, payload) =>
      handleSetTemporaryCoverage(ctx, {
        action: 'set_temporary_coverage',
        covering_cm_id: payload.covering_cm_id,
        starts_on: payload.starts_on,
        ends_on: payload.ends_on,
        note: payload.note ?? null,
        compensation_mode: payload.compensation_mode,
      }),
    {
      schema: setTemporaryCoverageSchema,
      requiredScope: 'customers.write',
      actionName: 'set_temporary_coverage',
    },
  );
}
