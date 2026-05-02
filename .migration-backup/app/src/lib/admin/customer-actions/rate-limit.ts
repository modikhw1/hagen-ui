import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import { recordAuditLog } from '@/lib/admin/audit-log';
import { isMissingRelationError } from '@/lib/admin/schema-guards';
import type { Database } from '@/types/database';
import type { AdminActionContext } from './types';

type CountQuery = {
  eq: (column: string, value: string) => CountQuery;
  in: (column: string, values: readonly string[]) => CountQuery;
  gte: (column: string, value: string) => Promise<{
    count: number | null;
    error: { message?: string } | null;
  }>;
};

type ActionLimit = {
  limit: number;
  windowMs: number;
  customerDailyLimit?: number;
};

const ACTION_LIMITS: Record<string, ActionLimit> = {
  send_invite: {
    limit: 5,
    windowMs: 60_000,
    customerDailyLimit: 30,
  },
  resend_invite: {
    limit: 5,
    windowMs: 60_000,
    customerDailyLimit: 30,
  },
  change_subscription_price: {
    limit: 10,
    windowMs: 60_000,
  },
  cancel_subscription: {
    limit: 10,
    windowMs: 60_000,
  },
  pause_subscription: {
    limit: 10,
    windowMs: 60_000,
  },
  resume_subscription: {
    limit: 10,
    windowMs: 60_000,
  },
  set_temporary_coverage: {
    limit: 30,
    windowMs: 60_000,
  },
};

async function countRecentRequests(params: {
  supabaseAdmin: SupabaseClient<Database>;
  actorUserId: string;
  actions: readonly string[];
  fromIso: string;
  entityId?: string | null;
}) {
  const baseQuery = (((params.supabaseAdmin.from('admin_request_log' as never) as never) as {
    select: (columns: string, options: { count: 'exact'; head: true }) => CountQuery;
  }).select('request_id', { count: 'exact', head: true }))
    .eq('actor_user_id', params.actorUserId)
    .in('action', params.actions);

  const scopedQuery = params.entityId
    ? baseQuery.eq('entity_id', params.entityId)
    : baseQuery;
  const result = await scopedQuery.gte('created_at', params.fromIso);
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

export async function enforceCustomerActionRateLimit(params: {
  ctx: AdminActionContext;
  action?: string;
}): Promise<Response | null> {
  const { ctx, action } = params;
  if (!action) {
    return null;
  }

  const limitConfig = ACTION_LIMITS[action];
  if (!limitConfig) {
    return null;
  }

  const now = Date.now();
  const windowStart = new Date(now - limitConfig.windowMs).toISOString();
  const requestsInWindow = await countRecentRequests({
    supabaseAdmin: ctx.supabaseAdmin,
    actorUserId: ctx.user.id,
    actions: [action],
    fromIso: windowStart,
  });
  if (requestsInWindow >= limitConfig.limit) {
    const retryAfterSeconds = Math.ceil(limitConfig.windowMs / 1000);
    await recordAuditLog(ctx.supabaseAdmin, {
      actorUserId: ctx.user.id,
      actorEmail: ctx.user.email,
      actorRole: ctx.user.role,
      action: 'admin.rate_limited',
      entityType: 'customer_profile',
      entityId: ctx.id,
      metadata: {
        limited_action: action,
        limit: limitConfig.limit,
        scope: 'actor_per_minute',
      },
    });
    return buildRateLimitedResponse({
      message: 'För många förfrågningar. Vänta en minut och försök igen.',
      retryAfterSeconds,
      limit: limitConfig.limit,
    });
  }

  if (!limitConfig.customerDailyLimit) {
    return null;
  }

  const dayStartIso = new Date(now - 24 * 60 * 60 * 1000).toISOString();
  const requestsForCustomer = await countRecentRequests({
    supabaseAdmin: ctx.supabaseAdmin,
    actorUserId: ctx.user.id,
    actions: [action],
    fromIso: dayStartIso,
    entityId: ctx.id,
  });
  if (requestsForCustomer >= limitConfig.customerDailyLimit) {
    await recordAuditLog(ctx.supabaseAdmin, {
      actorUserId: ctx.user.id,
      actorEmail: ctx.user.email,
      actorRole: ctx.user.role,
      action: 'admin.rate_limited',
      entityType: 'customer_profile',
      entityId: ctx.id,
      metadata: {
        limited_action: action,
        limit: limitConfig.customerDailyLimit,
        scope: 'actor_customer_per_day',
      },
    });
    return buildRateLimitedResponse({
      message: 'För många inbjudningsförsök för kunden senaste dygnet.',
      retryAfterSeconds: 60,
      limit: limitConfig.customerDailyLimit,
    });
  }

  return null;
}
