import { performance } from 'node:perf_hooks';
import { z } from 'zod';
import { overviewCopy } from '@/lib/admin/copy/overview';
import { requireScope, withAuth } from '@/lib/auth/api-auth';
import { loadAdminOverviewCosts } from '@/lib/admin/server/overview';
import { cachedJsonResponse } from '@/lib/admin/server/etag-response';
import { jsonError } from '@/lib/server/api-response';

const querySchema = z.object({}).strict();

export const GET = withAuth(async (request, user) => {
  requireScope(user, 'overview.read');

  const parsed = querySchema.safeParse(
    Object.fromEntries(request.nextUrl.searchParams.entries()),
  );
  if (!parsed.success) {
    return jsonError(overviewCopy.invalidQueryParams, 400);
  }

  const startedAt = performance.now();

  try {
    const payload = await loadAdminOverviewCosts();
    const totalMs = Math.round(performance.now() - startedAt);
    return cachedJsonResponse({
      request,
      payload,
      cacheControl: 'private, max-age=300, stale-while-revalidate=600',
      cacheTag: 'admin:overview:costs',
      dbMs: totalMs,
      totalMs,
    });
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : overviewCopy.loadCostsError,
      500,
    );
  }
}, ['admin']);
