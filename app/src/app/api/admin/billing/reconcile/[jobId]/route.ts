import { NextRequest } from 'next/server';
import { SERVER_COPY } from '@/lib/admin/copy/server-errors';
import { isMissingRelationError } from '@/lib/admin/schema-guards';
import { requireScope, withAuth } from '@/lib/auth/api-auth';
import { jsonError } from '@/lib/server/api-response';
import { createSupabaseAdmin } from '@/lib/server/supabase-admin';

interface RouteParams {
  params: Promise<{ jobId: string }>;
}

export const GET = withAuth(async (_request: NextRequest, user, context: RouteParams) => {
  requireScope(user, 'super_admin', SERVER_COPY.superAdminOnly);

  const { jobId } = await context.params;
  if (!jobId) {
    return jsonError('Jobb-ID krävs', 400);
  }

  const supabaseAdmin = createSupabaseAdmin();
  const result = await (((supabaseAdmin.from('admin_billing_reconcile_jobs' as never) as never) as {
    select: (columns: string) => {
      eq: (column: string, value: string) => {
        maybeSingle: () => Promise<{
          data: Record<string, unknown> | null;
          error: { message?: string } | null;
        }>;
      };
    };
  }).select(
    'id, scope, environment, since, status, payload, result, error_message, created_at, started_at, finished_at',
  )).eq('id', jobId).maybeSingle();

  if (result.error) {
    if (isMissingRelationError(result.error.message)) {
      return jsonError('Reconcile-jobb är inte aktiverat i databasen', 501);
    }
    return jsonError(result.error.message || 'Kunde inte hämta reconcile-jobb', 500);
  }
  if (!result.data) {
    return jsonError('Reconcile-jobb hittades inte', 404);
  }

  return new Response(
    JSON.stringify({
      jobId: result.data.id,
      scope: result.data.scope,
      environment: result.data.environment,
      since: result.data.since,
      status: result.data.status,
      payload: result.data.payload ?? null,
      result: result.data.result ?? null,
      error: result.data.error_message ?? null,
      queued_at: result.data.created_at,
      started_at: result.data.started_at ?? null,
      completed_at: result.data.finished_at ?? null,
    }),
    {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
      },
    },
  );
}, ['admin']);
