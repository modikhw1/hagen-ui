import 'server-only';

import { unstable_cache } from 'next/cache';
import { adminCustomerTag } from '@/lib/admin/cache-tags';
import type { TikTokStats } from '@/lib/admin/dtos/customer';
import { createSupabaseAdmin } from '@/lib/server/supabase-admin';
import {
  buildCustomerTikTokStats,
  fetchCustomerTikTokRuntime,
  type TikTokStatsSnapshotRow,
  type TikTokVideoRow,
} from '@/lib/tiktok/customer-runtime';

export { buildCustomerTikTokStats };
export type { TikTokStatsSnapshotRow, TikTokVideoRow };

export async function fetchCustomerTikTokStatsServer(id: string): Promise<TikTokStats | null> {
  return unstable_cache(
    async () => {
      const runtime = await fetchCustomerTikTokRuntime({
        customerId: id,
        supabase: createSupabaseAdmin(),
      });

      return runtime.stats;
    },
    ['admin-customer-tiktok-stats-rsc', id],
    {
      revalidate: 300,
      tags: [adminCustomerTag(id)],
    },
  )();
}
