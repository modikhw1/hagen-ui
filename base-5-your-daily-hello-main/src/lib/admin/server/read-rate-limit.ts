import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import { recordAuditLog } from '@/lib/admin/audit-log';
import { isMissingRelationError } from '@/lib/admin/schema-guards';
import type { Database } from '@/types/database';

type CountQuery = {
  eq: (column: string, value: string) => CountQuery;
  gte: (column: string, value: string) => Promise<{
    count: number | null;
    error: { message?: string } | null;
  }>;
};

async function countRecentRequests(params: {
  supabaseAdmin: SupabaseClient<Database>;
  actorUserId: string;
  action: string;
  fromIso: string;
}) {
  const result = await ((((params.supabaseAdmin.from(
    'admin_request_log' as never,
  ) as never) as {
    select: (columns: string, options: { count: 'exact'; head: true }) => CountQuery;
  }).select('request_id', {
    count: 'exact',
    head: true,
  }) as CountQuery)
    .eq('actor_user_id', params.actorUserId)
    .eq('action', params.action)
    .gte('created_at', params.fromIso));

  if (result.error) {
    if (isMissingRelationError(result.error.message)) {
      return 0;
    }
    throw new Error(result.error.message || 'Kunde inte verifiera rate-limit');
  }

  return result.count ?? 0;
}

function buildRateLimitedResponse(params: {
  message: string;
  retryAfterSeconds: number;
  limit: number;
}) {
  return new Response(
    JSON.stringify({
      error: params.message,
      code: 'rate_limited',
    }),
    {
      status: 429,
      headers: {
        'Content-Type': 'application/json',
        'Retry-After': String(params.retryAfterSeconds),
        'X-RateLimit-Limit': String(params.limit),
        'X-RateLimit-Remaining': '0',
      },
    },
  );
}

export async function enforceAdminReadRateLimit(params: {
  supabaseAdmin: SupabaseClient<Database>;
  actorUserId: string;
  actorEmail: string | null;
  actorRole: string;
  route: string;
  action: string;
  limit?: number;
  windowMs?: number;
}): Promise<Response | null> {
  const limit = params.limit ?? 120;
  const windowMs = params.windowMs ?? 60_000;
  const windowStartIso = new Date(Date.now() - windowMs).toISOString();
  const requestsInWindow = await countRecentRequests({
    supabaseAdmin: params.supabaseAdmin,
    actorUserId: params.actorUserId,
    action: params.action,
    fromIso: windowStartIso,
  });

  if (requestsInWindow < limit) {
    return null;
  }

  await recordAuditLog(params.supabaseAdmin, {
    actorUserId: params.actorUserId,
    actorEmail: params.actorEmail,
    actorRole: params.actorRole,
    action: 'admin.rate_limited',
    entityType: 'admin_route',
    entityId: params.route,
    metadata: {
      limited_action: params.action,
      limit,
      scope: 'admin_read_per_minute',
    },
  }).catch(() => undefined);

  return buildRateLimitedResponse({
    message: 'För många förfrågningar. Vänta en minut och försök igen.',
    retryAfterSeconds: Math.ceil(windowMs / 1000),
    limit,
  });
}
