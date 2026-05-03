import { z } from 'zod';
import { loadAdminTeamOverview } from '@/lib/admin/server/team';
import { requireScope, withAuth } from '@/lib/auth/api-auth';
import { jsonError } from '@/lib/server/api-response';

const querySchema = z
  .object({
    sort: z.enum(['standard', 'anomalous']).optional(),
  })
  .strict();

function nowMs() {
  return typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();
}

function formatDuration(value: number) {
  return Number.isFinite(value) ? value.toFixed(1) : '0.0';
}

export const GET = withAuth(async (request, user) => {
  requireScope(user, 'team.read');
  const requestStart = nowMs();

  const parsed = querySchema.safeParse({
    sort: request.nextUrl.searchParams.get('sort') ?? undefined,
  });
  if (!parsed.success) {
    return jsonError('Ogiltiga query-parametrar', 400);
  }

  const payload = await loadAdminTeamOverview(parsed.data.sort ?? 'standard');
  const totalDurationMs = nowMs() - requestStart;

  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'private, max-age=30',
      'Server-Timing': `build-team-overview;dur=${formatDuration(payload.buildDurationMs)},total;dur=${formatDuration(totalDurationMs)}`,
    },
  });
}, ['admin']);
