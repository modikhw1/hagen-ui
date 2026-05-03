import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/admin/api-client';
import { qk } from '@/lib/admin/queryKeys';
import type { OverviewDerivedPayload } from '@/lib/admin/overview-types';

export function useAdminOverview(sortMode: 'standard' | 'lowest_activity') {
  return useQuery<OverviewDerivedPayload | null>({
    queryKey: qk.overview.all(),
    queryFn: async () => {
      const [attention, metrics, cmPulse, costs] = await Promise.allSettled([
        apiClient.get(`/api/admin/overview/attention?sort=${sortMode}`),
        apiClient.get('/api/admin/overview/metrics'),
        apiClient.get(`/api/admin/overview/cm-pulse?sort=${sortMode}`),
        apiClient.get('/api/admin/service-costs'),
      ]);

      return {
        attentionItems: attention.status === 'fulfilled' ? ((attention.value as { items: OverviewDerivedPayload['attentionItems'] }).items ?? []) : [],
        topAttention: [],
        snoozedAttentionItems: [],
        snoozedCount: 0,
        attentionFeedSeenAt: null,
        metrics: metrics.status === 'fulfilled'
          ? (metrics.value as OverviewDerivedPayload['metrics'])
          : { revenueCard: { value: '–' }, activeCard: { value: '–' }, demosCard: { value: '–' }, costsCard: { value: '–' } } as OverviewDerivedPayload['metrics'],
        cmPulse: cmPulse.status === 'fulfilled' ? (cmPulse.value as OverviewDerivedPayload['cmPulse']) ?? [] : [],
        costs: costs.status === 'fulfilled' && costs.value
          ? (costs.value as OverviewDerivedPayload['costs'])
          : { entries: [], totalOre: 0 },
      };
    },
    staleTime: 30_000,
  });
}
