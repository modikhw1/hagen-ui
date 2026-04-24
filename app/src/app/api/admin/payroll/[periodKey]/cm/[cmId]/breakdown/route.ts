import { requireScope, withAuth } from '@/lib/auth/api-auth';
import { getPayrollBreakdown } from '@/lib/admin/payroll';
import { cachedJsonResponse } from '@/lib/admin/server/etag-response';
import { jsonError } from '@/lib/server/api-response';
import { createSupabaseAdmin } from '@/lib/server/supabase-admin';

function nowMs() {
  return typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();
}

export const GET = withAuth(async (request, user, context) => {
  requireScope(user, 'payroll.read');

  const routeContext = context as {
    params: Promise<{ periodKey?: string; cmId?: string }>;
  };
  const { periodKey, cmId } = await routeContext.params;
  if (!periodKey || !cmId) {
    return jsonError('Ogiltig payroll-breakdown route', 400);
  }

  const startedAt = nowMs();
  const supabaseAdmin = createSupabaseAdmin();

  try {
    const dbStart = nowMs();
    const payload = await getPayrollBreakdown(supabaseAdmin, {
      period: periodKey,
      cmId,
    });
    const dbMs = nowMs() - dbStart;

    if (!payload) {
      return jsonError('Ingen payroll-breakdown hittades för vald CM', 404);
    }

    return cachedJsonResponse({
      request,
      payload,
      cacheControl: 'private, max-age=30, stale-while-revalidate=60',
      cacheTag: `admin:payroll:${periodKey}:cm:${cmId}`,
      dbMs,
      totalMs: nowMs() - startedAt,
    });
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : 'Kunde inte hämta payroll-breakdown',
      500,
    );
  }
}, ['admin']);
