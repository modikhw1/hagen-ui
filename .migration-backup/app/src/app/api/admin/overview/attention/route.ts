import { performance } from 'node:perf_hooks';
import { z } from 'zod';
import { overviewCopy } from '@/lib/admin/copy/overview';
import { requireScope, withAuth } from '@/lib/auth/api-auth';
import { loadOverviewAttentionSection } from '@/lib/admin/server/overview';
import { cachedJsonResponse } from '@/lib/admin/server/etag-response';
import { jsonError } from '@/lib/server/api-response';

const querySchema = z
  .object({
    sort: z.enum(['standard', 'lowest_activity']).optional(),
  })
  .strict();

export const GET = withAuth(async (request, user) => {
  requireScope(user, 'overview.read');

  const parsed = querySchema.safeParse({
    sort: request.nextUrl.searchParams.get('sort') ?? undefined,
  });
  if (!parsed.success) {
    return jsonError(overviewCopy.invalidQueryParams, 400);
  }

  const startedAt = performance.now();
  const sortMode = parsed.data.sort ?? 'standard';

  try {
    const payload = await loadOverviewAttentionSection({
      sortMode,
      userId: user.id,
    });
    const totalMs = Math.round(performance.now() - startedAt);
    return cachedJsonResponse({
      request,
      payload,
      cacheControl: 'private, max-age=15, stale-while-revalidate=90',
      cacheTag: 'admin:overview:attention',
      dbMs: totalMs,
      totalMs,
    });
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : overviewCopy.loadOverviewError,
      500,
    );
  }
}, ['admin']);
