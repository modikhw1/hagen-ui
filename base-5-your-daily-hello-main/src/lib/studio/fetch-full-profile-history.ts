import 'server-only';

import { syncCustomerHistory } from '@/lib/studio/sync-customer-history';
import { createSupabaseAdmin } from '@/lib/server/supabase-admin';

type SupabaseAdmin = ReturnType<typeof createSupabaseAdmin>;

const FULL_HISTORY_PAGE_SIZE = 50;
const MAX_FULL_HISTORY_PAGES = 20;

export type FullProfileHistoryResult = {
  fetched: number;
  imported: number;
  skipped: number;
  stats_updated: number;
  reconciled: boolean;
  has_more: boolean;
  cursor: number | null;
  pages: number;
  error?: string;
};

export async function fetchFullProfileHistory(params: {
  supabase: SupabaseAdmin;
  customerId: string;
  handle: string;
  rapidApiKey: string;
}): Promise<FullProfileHistoryResult> {
  let totalFetched = 0;
  let totalImported = 0;
  let totalStatsUpdated = 0;
  let reconciled = false;
  let cursor: number | undefined;
  let hasMore = false;
  let pages = 0;

  while (pages < MAX_FULL_HISTORY_PAGES) {
    // Keep full-history imports from advancing the plan mid-backfill.
    const result = await syncCustomerHistory(
      params.supabase,
      params.customerId,
      params.handle,
      params.rapidApiKey,
      {
        mode: 'manual',
        count: FULL_HISTORY_PAGE_SIZE,
        cursor,
        suppressAutoReconcile: true,
      },
    );

    if (result.error === 'already_locked') {
      return {
        fetched: totalFetched,
        imported: totalImported,
        skipped: Math.max(totalFetched - totalImported, 0),
        stats_updated: totalStatsUpdated,
        reconciled,
        has_more: hasMore,
        cursor: cursor ?? null,
        pages,
        error: result.error,
      };
    }

    pages += 1;
    totalFetched += result.fetched;
    totalImported += result.imported;
    totalStatsUpdated += result.statsUpdated;
    reconciled = reconciled || result.reconciled;
    hasMore = result.has_more;

    if (!result.has_more || result.cursor === null) {
      cursor = result.cursor ?? undefined;
      break;
    }

    cursor = result.cursor ?? undefined;
  }

  return {
    fetched: totalFetched,
    imported: totalImported,
    skipped: Math.max(totalFetched - totalImported, 0),
    stats_updated: totalStatsUpdated,
    reconciled,
    has_more: hasMore,
    cursor: cursor ?? null,
    pages,
  };
}
