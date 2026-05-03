import { NextRequest } from 'next/server';
import { z } from 'zod';
import { SERVER_COPY } from '@/lib/admin/copy/server-errors';
import { handleSetTemporaryCoverage } from '@/lib/admin/customer-actions/set-temporary-coverage';
import { loadCustomerDetail } from '@/lib/admin/customer-detail/load';
import {
  runCustomerActionRoute,
  type CustomerActionRouteParams,
} from '@/lib/admin/customer-actions/route-helpers';
import { requireScope, withAuth } from '@/lib/auth/api-auth';
import { jsonError } from '@/lib/server/api-response';
import { createSupabaseAdmin } from '@/lib/server/supabase-admin';

const coverageSchema = z
  .object({
    covering_cm_id: z.string().uuid(),
    starts_on: z.string().trim().min(1),
    ends_on: z.string().trim().min(1),
    note: z.string().trim().max(1000).optional().nullable(),
    compensation_mode: z.enum(['covering_cm', 'primary_cm']).default('covering_cm'),
  })
  .strict();

interface GetRouteParams {
  params: Promise<{ id: string }>;
}

export const GET = withAuth(async (_request, user, { params }: GetRouteParams) => {
  requireScope(user, 'customers.read');

  const { id } = await params;
  if (!id) {
    return jsonError(SERVER_COPY.customerIdRequired, 400);
  }

  const payload = await loadCustomerDetail({
    supabaseAdmin: createSupabaseAdmin(),
    id,
    user,
  });

  return new Response(
    JSON.stringify({
      coverage_absences: payload.customer.coverage_absences ?? [],
    }),
    {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'private, max-age=30',
      },
    },
  );
}, ['admin']);

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
      schema: coverageSchema,
      requiredScope: 'customers.write',
      actionName: 'set_temporary_coverage',
    },
  );
}
