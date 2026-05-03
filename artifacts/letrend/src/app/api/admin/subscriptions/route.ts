import { createHash } from 'node:crypto';
import { NextRequest } from 'next/server';
import { SERVER_COPY } from '@/lib/admin/copy/server-errors';
import { parseSubscriptionListQuery } from '@/lib/admin/billing-route-query';
import { withRequestContext } from '@/lib/admin/customer-actions/with-request-context';
import { listAdminSubscriptions } from '@/lib/admin/billing-list.server';
import { enforceAdminReadRateLimit } from '@/lib/admin/server/read-rate-limit';
import { requireScope, withAuth } from '@/lib/auth/api-auth';
import { jsonError } from '@/lib/server/api-response';
import { createSupabaseAdmin } from '@/lib/server/supabase-admin';

function createStrongEtag(payload: unknown) {
  const body = JSON.stringify(payload);
  const etag = `"${createHash('sha1').update(body).digest('base64url')}"`;
  return { body, etag };
}

export const GET = withAuth(async (request: NextRequest, user) => {
  const supabaseAdmin = createSupabaseAdmin();
  return withRequestContext({
    request,
    route: request.nextUrl.pathname,
    action: 'billing_subscriptions_list_get',
    actorUserId: user.id,
    supabaseAdmin,
    execute: async () => {
      try {
        requireScope(user, 'billing.subscriptions.read');

        const parsed = parseSubscriptionListQuery(request);
        if (!parsed.success) {
          return jsonError(SERVER_COPY.invalidQuery, 400);
        }

        const filters = parsed.data;
        const result = await listAdminSubscriptions({
          supabaseAdmin,
          filters: {
            limit: filters.limit ?? 50,
            page: filters.page ?? 1,
            status: filters.status,
            sort: filters.sort,
            q: filters.q,
            fromDate: filters.from,
            toDate: filters.to,
            environment: filters.environment,
            customerProfileId: filters.customer_profile_id,
            stripeSubscriptionId: filters.stripe_subscription_id,
          },
        });

        const payload = {
          subscriptions: result.subscriptions,
          environment: filters.environment ?? 'all',
          summary: result.summary,
          pagination: result.pagination,
        };
        
        const lastId = result.subscriptions[result.subscriptions.length - 1]?.id ?? 'none';
        const etag = `W/"${result.pagination.total}-${result.pagination.page}-${lastId}"`;

        if (request.headers.get('if-none-match') === etag) {
          return new Response(null, { status: 304, headers: { ETag: etag } });
        }

        return new Response(JSON.stringify(payload), {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'private, max-age=5, stale-while-revalidate=60',
            'ETag': etag,
            'X-Total-Count': String(result.pagination.total),
          },
        });
      } catch (error) {
        return jsonError(
          error instanceof Error ? error.message : SERVER_COPY.serverError,
          500,
        );
      }
    },
  });
}, ['admin']);
