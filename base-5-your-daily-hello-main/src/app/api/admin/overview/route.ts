import { performance } from 'node:perf_hooks';
import { z } from 'zod';
import { overviewCopy } from '@/lib/admin/copy/overview';
import { requireScope, withAuth } from '@/lib/auth/api-auth';
import {
  loadAdminOverviewCosts,
  loadOverviewAttentionSection,
  loadOverviewCmPulseSection,
  loadOverviewMetricsSection,
} from '@/lib/admin/server/overview';
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

  const sortMode = parsed.data.sort ?? 'standard';
  const startedAt = performance.now();

  try {
    const [metrics, attention, cmPulse, costs] = await Promise.all([
      loadOverviewMetricsSection(),
      loadOverviewAttentionSection({ sortMode, userId: user.id }),
      loadOverviewCmPulseSection({ sortMode }),
      loadAdminOverviewCosts(),
    ]);

    console.info(
      JSON.stringify({
        level: 'info',
        area: 'admin',
        event: 'overview.legacy.hit',
        user_id: user.id,
      }),
    );

    const totalMs = Math.round(performance.now() - startedAt);
    const payload = {
      metrics: metrics.metrics,
      cmPulse: cmPulse.cmPulse,
      attentionItems: attention.attentionItems,
      snoozedAttentionItems: attention.snoozedAttentionItems,
      snoozedCount: attention.snoozedCount,
      costs,
      attentionFeedSeenAt: attention.attentionFeedSeenAt,
    };

    return cachedJsonResponse({
      request,
      payload,
      cacheControl: 'private, max-age=30, stale-while-revalidate=120',
      cacheTag: 'admin:overview:legacy',
      dbMs: totalMs,
      totalMs,
      headers: {
        Deprecation: 'true',
      },
    });
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : overviewCopy.loadOverviewError,
      500,
    );
  }
}, ['admin']);
