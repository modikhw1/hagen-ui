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
        apiClient.get('/api/admin/overview/costs'),
      ]);

      const attentionData = attention.status === 'fulfilled'
        ? (attention.value as Record<string, unknown>)
        : null;
      const metricsData = metrics.status === 'fulfilled'
        ? (metrics.value as Record<string, unknown>)
        : null;
      const cmPulseData = cmPulse.status === 'fulfilled'
        ? (cmPulse.value as Record<string, unknown>)
        : null;
      const costsData = costs.status === 'fulfilled'
        ? (costs.value as Record<string, unknown>)
        : null;

      return {
        attentionItems: (attentionData?.['attentionItems'] as OverviewDerivedPayload['attentionItems']) ?? [],
        topAttention: [],
        snoozedAttentionItems: (attentionData?.['snoozedAttentionItems'] as OverviewDerivedPayload['snoozedAttentionItems']) ?? [],
        snoozedCount: (attentionData?.['snoozedCount'] as number) ?? 0,
        attentionFeedSeenAt: (attentionData?.['attentionFeedSeenAt'] as string | null) ?? null,
        metrics: (metricsData?.['metrics'] as OverviewDerivedPayload['metrics']) ?? ({
          revenueCard: { label: 'MRR', value: '–' },
          activeCard: { label: 'Kunder', value: '–' },
          demosCard: { label: 'Demos', value: '–' },
          costsCard: { label: 'Kostnader', value: '–' },
        } as OverviewDerivedPayload['metrics']),
        cmPulse: (cmPulseData?.['cmPulse'] as OverviewDerivedPayload['cmPulse']) ?? [],
        costs: (costsData as OverviewDerivedPayload['costs'] | null) ?? { entries: [], totalOre: 0 },
      };
    },
    staleTime: 30_000,
  });
}
