import { NextRequest } from 'next/server';
import { SERVER_COPY } from '@/lib/admin/copy/server-errors';
import {
  buildRouteErrorResponse,
} from '@/lib/admin/customer-actions/shared';
import {
  runCustomerActionRoute,
  type CustomerActionRouteParams,
} from '@/lib/admin/customer-actions/route-helpers';
import { updateCustomerProfile } from '@/lib/admin/customer-actions/update-profile';
import { withRequestContext } from '@/lib/admin/customer-actions/with-request-context';
import { loadCustomerDetail } from '@/lib/admin/customer-detail/load';
import { enforceAdminReadRateLimit } from '@/lib/admin/server/read-rate-limit';
import { validateApiRequest } from '@/lib/auth/api-auth';
import { jsonError, jsonOk } from '@/lib/server/api-response';
import { createSupabaseAdmin } from '@/lib/server/supabase-admin';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  const logContext: {
    actorUserId?: string | null;
    entityId?: string | null;
    supabaseAdmin?: ReturnType<typeof createSupabaseAdmin>;
  } = {};

  return withRequestContext({
    request,
    route: request.nextUrl.pathname,
    action: 'customer_detail_get',
    getLogContext: () => logContext,
    execute: async () => {
      try {
        const user = await validateApiRequest(request, ['admin', 'customer', 'content_manager']);
        const { id } = await params;
        if (!id) {
          return jsonError(SERVER_COPY.customerIdRequired, 400);
        }

        const supabaseAdmin = createSupabaseAdmin();
        logContext.actorUserId = user.id;
        logContext.entityId = id;
        logContext.supabaseAdmin = supabaseAdmin;

        return jsonOk(await loadCustomerDetail({ supabaseAdmin, id, user }));
      } catch (error) {
        return buildRouteErrorResponse(error);
      }
    },
  });
}

export function PATCH(request: NextRequest, context: CustomerActionRouteParams) {
  return runCustomerActionRoute(request, context, updateCustomerProfile, {
    requiredScope: 'customers.write',
    actionName: 'update_profile',
  });
}
