import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import { isMissingRelationError } from '@/lib/admin/schema-guards';

const BILLING_SYNC_RATE_LIMIT_WINDOW_MS = 60_000;
export const BILLING_SYNC_RATE_LIMIT_MAX_REQUESTS = 5;

const BILLING_SYNC_ACTIONS = [
  'billing.sync_invoices',
  'billing.sync_subscriptions',
  'billing.health_retry',
  'billing.reconcile.request',
] as const;

type BillingRateLimitStatus = {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
};

type CountQuery = {
  eq: (column: string, value: string) => CountQuery;
  in: (column: string, values: readonly string[]) => CountQuery;
  gte: (column: string, value: string) => Promise<{
    count: number | null;
    error: { message?: string } | null;
  }>;
};

function resolveBillingRateLimitStatus(requestsInWindow: number): BillingRateLimitStatus {
  if (requestsInWindow >= BILLING_SYNC_RATE_LIMIT_MAX_REQUESTS) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: Math.ceil(BILLING_SYNC_RATE_LIMIT_WINDOW_MS / 1000),
    };
  }

  return {
    allowed: true,
    remaining: BILLING_SYNC_RATE_LIMIT_MAX_REQUESTS - requestsInWindow,
    retryAfterSeconds: 0,
  };
}

export async function checkBillingSyncRateLimit(params: {
  supabaseAdmin: SupabaseClient;
  adminUserId: string;
  now?: Date;
}): Promise<BillingRateLimitStatus> {
  const now = params.now ?? new Date();
  const windowStart = new Date(now.getTime() - BILLING_SYNC_RATE_LIMIT_WINDOW_MS).toISOString();
  const result = await (((params.supabaseAdmin.from('audit_log' as never) as never) as {
    select: (columns: string, options: { count: 'exact'; head: true }) => CountQuery;
  }).select('id', { count: 'exact', head: true }))
    .eq('actor_user_id', params.adminUserId)
    .in('action', BILLING_SYNC_ACTIONS)
    .gte('created_at', windowStart);

  if (result.error) {
    if (isMissingRelationError(result.error.message)) {
      return {
        allowed: true,
        remaining: BILLING_SYNC_RATE_LIMIT_MAX_REQUESTS,
        retryAfterSeconds: 0,
      };
    }
    throw new Error(result.error.message || 'Kunde inte verifiera sync-rate-limit');
  }

  return resolveBillingRateLimitStatus(result.count ?? 0);
}

export function billingSyncRateLimitedResponse(retryAfterSeconds: number) {
  return new Response(
    JSON.stringify({
      error: 'För många sync-försök. Vänta en minut och försök igen.',
      code: 'rate_limited',
    }),
    {
      status: 429,
      headers: {
        'Content-Type': 'application/json',
        'Retry-After': String(retryAfterSeconds),
        'X-RateLimit-Limit': String(BILLING_SYNC_RATE_LIMIT_MAX_REQUESTS),
        'X-RateLimit-Remaining': '0',
      },
    },
  );
}
