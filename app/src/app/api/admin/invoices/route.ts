import { createHash } from 'node:crypto';
import { NextRequest } from 'next/server';
import { SERVER_COPY } from '@/lib/admin/copy/server-errors';
import { parseInvoiceListQuery } from '@/lib/admin/billing-route-query';
import { withRequestContext } from '@/lib/admin/customer-actions/with-request-context';
import { listAdminInvoices } from '@/lib/admin/billing-list.server';
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
    action: 'billing_invoices_list_get',
    actorUserId: user.id,
    supabaseAdmin,
    execute: async () => {
      try {
        requireScope(user, 'billing.invoices.read');

        const limitedResponse = await enforceAdminReadRateLimit({
          supabaseAdmin,
          actorUserId: user.id,
          actorEmail: user.email,
          actorRole: user.role,
          route: request.nextUrl.pathname,
          action: 'billing_invoices_list_get',
        });
        if (limitedResponse) {
          return limitedResponse;
        }

        const parsed = parseInvoiceListQuery(request);
        if (!parsed.success) {
          return jsonError(SERVER_COPY.invalidQuery, 400);
        }

        const filters = parsed.data;
        const result = await listAdminInvoices({
          supabaseAdmin,
          filters: {
            limit: filters.limit ?? 50,
            page: filters.page ?? 1,
            customerProfileId: filters.customer_profile_id ?? filters.customerProfileId,
            status: filters.status,
            q: filters.q,
            fromDate: filters.from,
            toDate: filters.to,
            environment: filters.environment,
            includeLineItems: filters.includeLineItems ?? false,
          },
        });

        const payload = {
          invoices: result.invoices,
          environment: filters.environment ?? 'all',
          pagination: result.pagination,
          summary: result.summary,
        };
        const { body, etag } = createStrongEtag(payload);
        const cacheTag = `admin:billing:invoices,env:${filters.environment ?? 'all'}`;

        if (request.headers.get('if-none-match') === etag) {
          return new Response(null, {
            status: 304,
            headers: {
              ETag: etag,
              'Cache-Control': 'private, max-age=10, stale-while-revalidate=30',
              'Cache-Tag': cacheTag,
            },
          });
        }

        return new Response(body, {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'private, max-age=10, stale-while-revalidate=30',
            ETag: etag,
            'Cache-Tag': cacheTag,
            'X-Total-Count': String(result.pagination.total),
            'X-Page': String(result.pagination.page),
            'X-Page-Size': String(result.pagination.limit),
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
