'use client';

import { useQuery } from '@tanstack/react-query';
import {
  captureAdminError,
  measureAdminAsync,
} from '@/lib/admin/admin-telemetry';
import type { OverviewDerivedPayload } from '@/lib/admin/overview-types';
import { qk } from '@/lib/admin/queryKeys';

async function fetchOverview(
  sortMode: 'standard' | 'lowest_activity',
): Promise<OverviewDerivedPayload> {
  return measureAdminAsync(
    'overview_load_ms',
    async () => {
      const response = await fetch(`/api/admin/overview?sort=${sortMode}`, {
        credentials: 'include',
      });
      const payload = (await response.json().catch(() => ({}))) as OverviewDerivedPayload & {
        error?: string;
      };

      if (!response.ok) {
        const error = new Error(payload.error || 'Kunde inte hamta overview-data');
        captureAdminError('admin.overview.load', error, { sort_mode: sortMode });
        throw error;
      }

      return payload;
    },
    { sort_mode: sortMode },
  );
}

export function useOverviewData(sortMode: 'standard' | 'lowest_activity' = 'standard') {
  return useQuery({
    queryKey: [...qk.overview.main(), sortMode] as const,
    queryFn: () => fetchOverview(sortMode),
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });
}
