'use client';

import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/admin/api-client';
import { parseDto } from '@/lib/admin/dtos/parse';
import { qk } from '@/lib/admin/queryKeys';
import {
  tikTokStatsSchema,
  type TikTokStats,
} from '@/lib/admin/dtos/customer';

export function useCustomerTikTokStats(id: string) {
  return useQuery({
    queryKey: qk.customers.tiktok(id),
    enabled: Boolean(id),
    queryFn: async ({ signal }): Promise<TikTokStats | null> => {
      const payload = await apiClient.get(`/api/admin/customers/${id}/tiktok-stats`, {
        signal,
      });
      if (payload === null) {
        return null;
      }
      return parseDto(tikTokStatsSchema, payload);
    },
    staleTime: 300_000,
    refetchOnWindowFocus: false,
  });
}

export const useTikTokStats = useCustomerTikTokStats;

export type { TikTokStats } from '@/lib/admin/dtos/customer';
