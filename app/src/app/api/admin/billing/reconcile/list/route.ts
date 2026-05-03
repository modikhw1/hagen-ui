import { NextRequest } from 'next/server';
import { z } from 'zod';
import { SERVER_COPY } from '@/lib/admin/copy/server-errors';
import { isMissingRelationError } from '@/lib/admin/schema-guards';
import { requireScope, withAuth } from '@/lib/auth/api-auth';
import { jsonError } from '@/lib/server/api-response';
import { createSupabaseAdmin } from '@/lib/server/supabase-admin';

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  status: z.enum(['queued', 'running', 'succeeded', 'failed', 'cancelled']).optional(),
});

export const GET = withAuth(async (request: NextRequest, user) => {
  requireScope(user, 'billing.health.read');

  const parsed = querySchema.safeParse({
    limit: request.nextUrl.searchParams.get('limit') ?? undefined,
    status: request.nextUrl.searchParams.get('status') ?? undefined,
  });
  if (!parsed.success) {
    return jsonError(SERVER_COPY.invalidPayload, 400, { details: parsed.error.issues });
  }

  const supabaseAdmin = createSupabaseAdmin();
  const table = supabaseAdmin.from('admin_billing_reconcile_jobs' as never) as never as {
    select: (columns: string) => {
      order: (column: string, options: { ascending: boolean }) => {
        limit: (value: number) => Promise<{
          data: Record<string, unknown>[] | null;
          error: { message?: string } | null;
        }>;
        eq?: (column: string, value: string) => {
          limit: (value: number) => Promise<{
            data: Record<string, unknown>[] | null;
            error: { message?: string } | null;
          }>;
        };
      };
    };
  };

  const baseQuery = table
    .select(
      'id, scope, environment, status, since, payload, result, error_message, created_at, started_at, finished_at, requested_by',
    )
    .order('created_at', { ascending: false });

  const result = parsed.data.status
    ? await baseQuery.eq!('status', parsed.data.status).limit(parsed.data.limit)
    : await baseQuery.limit(parsed.data.limit);

  if (result.error) {
    if (isMissingRelationError(result.error.message)) {
      return new Response(
        JSON.stringify({
          jobs: [],
          schemaWarning: 'Tabellen admin_billing_reconcile_jobs saknas. Kör migration.',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }
    return jsonError(result.error.message || 'Kunde inte hämta jobb', 500);
  }

  return new Response(JSON.stringify({ jobs: result.data ?? [] }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'private, max-age=10',
    },
  });
}, ['admin']);
