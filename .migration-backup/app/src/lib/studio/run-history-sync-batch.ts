import { createSupabaseAdmin } from '@/lib/server/supabase-admin';
import { syncCustomerHistory } from '@/lib/studio/sync-customer-history';

const STALENESS_HOURS = 1;

type SyncBatchError = {
  customerId: string;
  step: string;
  error: string;
};

type SyncBatchResult = {
  processed: number;
  new_clips: number;
  stats_updated: number;
  reconciled: number;
  nudges_created: number;
  errors: SyncBatchError[];
};

type SyncEligibleCustomer = {
  id: string;
  tiktok_handle: string;
  status: string | null;
  last_history_sync_at: string | null;
};

async function withRetry<T>(fn: () => Promise<T>, maxRetries = 2, delayMs = 1000): Promise<T> {
  for (let i = 0; i <= maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      const message = (error as Error).message ?? '';
      if (message.includes('429') || message.toLowerCase().includes('rate limit')) {
        throw error;
      }
      if (i === maxRetries) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, delayMs * (i + 1)));
    }
  }

  throw new Error('withRetry: unreachable');
}

export async function runHistorySyncBatch(params: {
  rapidApiKey: string;
  delayMs?: number;
}): Promise<SyncBatchResult> {
  const delayMs = params.delayMs ?? 500;
  const supabase = createSupabaseAdmin();
  const cutoff = new Date(Date.now() - STALENESS_HOURS * 60 * 60 * 1000).toISOString();

  const { data: customers, error: queryError } = await supabase
    .from('customer_profiles')
    .select('id, tiktok_handle, status, last_history_sync_at')
    .in('status', ['active', 'agreed', 'invited'])
    .not('tiktok_handle', 'is', null)
    .neq('tiktok_handle', '');

  if (queryError) {
    throw new Error(queryError.message || 'Kunde inte hamta kunder for TikTok-synk.');
  }

  const eligible = ((customers ?? []) as SyncEligibleCustomer[]).filter((customer) => {
    if (!customer.tiktok_handle?.trim()) {
      return false;
    }

    if (customer.status === 'invited') {
      return !customer.last_history_sync_at;
    }

    if (!customer.last_history_sync_at) {
      return true;
    }

    return customer.last_history_sync_at < cutoff;
  });

  let newClipsTotal = 0;
  let statsUpdatedTotal = 0;
  let reconciledTotal = 0;
  let nudgesCreatedTotal = 0;
  const errors: SyncBatchError[] = [];

  for (const [index, customer] of eligible.entries()) {
    const handle = customer.tiktok_handle.trim().replace(/^@/, '');

    if (!handle) {
      errors.push({
        customerId: customer.id,
        step: 'syncCustomerHistory',
        error: 'ingen_tiktok_handle',
      });
      continue;
    }

    try {
      const result = await withRetry(() =>
        syncCustomerHistory(supabase, customer.id, handle, params.rapidApiKey, { mode: 'cron' }),
      );

      if (result.error === 'already_locked') {
        continue;
      }

      newClipsTotal += result.imported;
      statsUpdatedTotal += result.statsUpdated;
      if (result.reconciled) {
        reconciledTotal++;
      }
      if (result.nudgeCreated) {
        nudgesCreatedTotal++;
      }
    } catch (error) {
      const message = (error as Error).message ?? String(error);
      const isRateLimit = message.includes('429') || message.toLowerCase().includes('rate limit');
      errors.push({
        customerId: customer.id,
        step: 'syncCustomerHistory',
        error: isRateLimit ? `rate_limited: ${message}` : `sync_fel: ${message}`,
      });
      continue;
    }

    if (delayMs > 0 && index < eligible.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  return {
    processed: eligible.length,
    new_clips: newClipsTotal,
    stats_updated: statsUpdatedTotal,
    reconciled: reconciledTotal,
    nudges_created: nudgesCreatedTotal,
    errors,
  };
}
