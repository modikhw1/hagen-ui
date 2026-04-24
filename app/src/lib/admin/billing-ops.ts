'use client';

import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { EnvFilter } from '@/lib/admin/billing';
import { addAdminBreadcrumb, captureAdminError } from '@/lib/admin/admin-telemetry';
import { ApiError, apiClient } from '@/lib/admin/api-client';
import { invalidateAdminScopes, type AdminRefreshScope } from '@/lib/admin/invalidate';

type BillingOpResult = {
  ok: boolean;
  syncedCount?: number;
  skippedCount?: number;
  idempotencyKey?: string;
  message?: string;
  [key: string]: unknown;
};

class BillingOpError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    public readonly code?: string,
    public readonly retryAfterSeconds: number = 0,
  ) {
    super(message);
    this.name = 'BillingOpError';
  }
}

type BillingOpHookResult = {
  run: () => Promise<BillingOpResult>;
  isPending: boolean;
  error: Error | null;
  lastRunAt: string | null;
  rateLimitRemainingSeconds: number;
};

function retryAfterFromApiError(error: ApiError) {
  if (error.status !== 429) {
    return 0;
  }

  const raw = error.raw as { retryAfter?: unknown } | undefined;
  const retryAfter = Number(raw?.retryAfter ?? 0);
  return Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : 0;
}

async function runBillingOp(params: {
  url: string;
  body: Record<string, unknown>;
  action: string;
}) {
  addAdminBreadcrumb(params.action, {
    phase: 'start',
    ...params.body,
  });

  let payload: BillingOpResult;
  try {
    payload = await apiClient.post<BillingOpResult>(params.url, params.body);
  } catch (error) {
    captureAdminError(params.action, error, params.body);
    if (error instanceof ApiError) {
      throw new BillingOpError(
        error.message,
        error.status,
        error.code,
        retryAfterFromApiError(error),
      );
    }
    throw error instanceof Error ? error : new Error('Operationen misslyckades');
  }

  const idempotencyKey = payload.idempotencyKey;

  if (idempotencyKey) {
    toast.success('Admin-operation klar', {
      description: `Idempotency-Key: ${idempotencyKey}`,
    });
  }

  addAdminBreadcrumb(params.action, {
    phase: 'success',
    ...params.body,
    idempotency_key: idempotencyKey,
    synced_count: payload.syncedCount,
    skipped_count: payload.skippedCount,
  });

  return {
    ...payload,
    idempotencyKey,
  };
}

function useBillingOp(params: {
  mutationKey: readonly string[];
  url: string;
  body: Record<string, unknown>;
  action: string;
  refreshScopes: readonly AdminRefreshScope[];
}) {
  const queryClient = useQueryClient();
  const [lastRunAt, setLastRunAt] = useState<string | null>(null);
  const [rateLimitedUntilMs, setRateLimitedUntilMs] = useState<number | null>(null);
  const [clockMs, setClockMs] = useState<number>(() => Date.now());

  useEffect(() => {
    if (rateLimitedUntilMs === null) {
      return;
    }

    const intervalId = window.setInterval(() => {
      setClockMs(Date.now());
    }, 1000);

    return () => window.clearInterval(intervalId);
  }, [rateLimitedUntilMs]);

  const rateLimitRemainingSeconds = useMemo(() => {
    if (rateLimitedUntilMs === null) {
      return 0;
    }

    const remainingMs = rateLimitedUntilMs - clockMs;
    if (remainingMs <= 0) {
      return 0;
    }

    return Math.ceil(remainingMs / 1000);
  }, [clockMs, rateLimitedUntilMs]);

  const mutation = useMutation({
    mutationKey: params.mutationKey,
    mutationFn: () =>
      runBillingOp({
        url: params.url,
        body: params.body,
        action: params.action,
      }),
    onSuccess: async () => {
      setLastRunAt(new Date().toISOString());
      setRateLimitedUntilMs(null);
      await invalidateAdminScopes(queryClient, params.refreshScopes);
    },
    onError: (error) => {
      if (error instanceof BillingOpError && error.retryAfterSeconds > 0) {
        setRateLimitedUntilMs(Date.now() + error.retryAfterSeconds * 1000);
      }
    },
  });

  return {
    run: async () => mutation.mutateAsync(),
    isPending: mutation.isPending,
    error: mutation.error instanceof Error ? mutation.error : null,
    lastRunAt,
    rateLimitRemainingSeconds,
  } satisfies BillingOpHookResult;
}

export function useStripeSyncInvoices(env: EnvFilter) {
  return useBillingOp({
    mutationKey: ['admin', 'billing-op', 'sync-invoices', env],
    url: '/api/admin/billing/sync-invoices',
    body: { env },
    action: 'admin.billing.sync_invoices',
    refreshScopes: ['billing'],
  });
}

export function useStripeSyncSubscriptions(env: EnvFilter) {
  return useBillingOp({
    mutationKey: ['admin', 'billing-op', 'sync-subscriptions', env],
    url: '/api/admin/billing/sync-subscriptions',
    body: { env },
    action: 'admin.billing.sync_subscriptions',
    refreshScopes: ['billing'],
  });
}

export function useBillingHealthRetry() {
  return useBillingOp({
    mutationKey: ['admin', 'billing-op', 'health-retry'],
    url: '/api/admin/billing/health-retry',
    body: {},
    action: 'admin.billing.health_retry',
    refreshScopes: ['billing'],
  });
}
