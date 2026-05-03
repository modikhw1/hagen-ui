'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/admin/api-client';
import {
  captureAdminError,
  measureAdminAsync,
} from '@/lib/admin/admin-telemetry';
import { parseDto } from '@/lib/admin/dtos/parse';
import {
  overviewAttentionResponseSchema,
  overviewCmPulseResponseSchema,
  overviewCostsResponseSchema,
  overviewMetricsResponseSchema,
  type OverviewAttentionDTO,
  type OverviewCmPulseDTO,
  type OverviewCostsDTO,
  type OverviewMetricsDTO,
} from '@/lib/admin/dtos/overview';
import { qk } from '@/lib/admin/queryKeys';

async function fetchOverviewMetrics(signal?: AbortSignal): Promise<OverviewMetricsDTO> {
  return measureAdminAsync(
    'overview_metrics_load_ms',
    async () => {
      try {
        const payload = await apiClient.get('/api/admin/overview/metrics', {
          signal,
        });
        return parseDto(overviewMetricsResponseSchema, payload, {
          name: 'overviewMetricsPayload',
          path: '/api/admin/overview/metrics',
        });
      } catch (error) {
        const normalizedError =
          error instanceof Error ? error : new Error('Kunde inte h\u00e4mta overview-metrics');
        captureAdminError('admin.overview.metrics.load', normalizedError);
        throw normalizedError;
      }
    },
    {},
  );
}

async function fetchOverviewAttention(
  sortMode: 'standard' | 'lowest_activity',
  signal?: AbortSignal,
): Promise<OverviewAttentionDTO> {
  return measureAdminAsync(
    'overview_attention_load_ms',
    async () => {
      try {
        const payload = await apiClient.get('/api/admin/overview/attention', {
          signal,
          query: { sort: sortMode },
        });
        return parseDto(overviewAttentionResponseSchema, payload, {
          name: 'overviewAttentionPayload',
          path: '/api/admin/overview/attention',
        });
      } catch (error) {
        const normalizedError =
          error instanceof Error ? error : new Error('Kunde inte h\u00e4mta overview-attention');
        captureAdminError('admin.overview.attention.load', normalizedError, {
          sort_mode: sortMode,
        });
        throw normalizedError;
      }
    },
    { sort_mode: sortMode },
  );
}

async function fetchOverviewCmPulse(
  sortMode: 'standard' | 'lowest_activity',
  signal?: AbortSignal,
): Promise<OverviewCmPulseDTO> {
  return measureAdminAsync(
    'overview_cm_pulse_load_ms',
    async () => {
      try {
        const payload = await apiClient.get('/api/admin/overview/cm-pulse', {
          signal,
          query: { sort: sortMode },
        });
        return parseDto(overviewCmPulseResponseSchema, payload, {
          name: 'overviewCmPulsePayload',
          path: '/api/admin/overview/cm-pulse',
        });
      } catch (error) {
        const normalizedError =
          error instanceof Error ? error : new Error('Kunde inte h\u00e4mta overview CM-puls');
        captureAdminError('admin.overview.cm_pulse.load', normalizedError, {
          sort_mode: sortMode,
        });
        throw normalizedError;
      }
    },
    { sort_mode: sortMode },
  );
}

async function fetchOverviewCosts(signal?: AbortSignal): Promise<OverviewCostsDTO> {
  return measureAdminAsync(
    'overview_costs_load_ms',
    async () => {
      try {
        const payload = await apiClient.get('/api/admin/overview/costs', {
          signal,
        });
        return parseDto(overviewCostsResponseSchema, payload, {
          name: 'overviewCostsPayload',
          path: '/api/admin/overview/costs',
        });
      } catch (error) {
        const normalizedError =
          error instanceof Error ? error : new Error('Kunde inte h\u00e4mta overview-kostnader');
        captureAdminError('admin.overview.costs.load', normalizedError);
        throw normalizedError;
      }
    },
    {},
  );
}

export function useOverviewData(sortMode: 'standard' | 'lowest_activity' = 'standard') {
  const metricsQuery = useQuery({
    queryKey: qk.overview.metrics(),
    queryFn: ({ signal }) => fetchOverviewMetrics(signal),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    placeholderData: (previousData) => previousData,
  });

  const attentionQuery = useQuery({
    queryKey: qk.overview.attention(sortMode),
    queryFn: ({ signal }) => fetchOverviewAttention(sortMode, signal),
    staleTime: 15_000,
    refetchOnWindowFocus: false,
    placeholderData: (previousData) => previousData,
  });

  const cmPulseQuery = useQuery({
    queryKey: qk.overview.cmPulse(sortMode),
    queryFn: ({ signal }) => fetchOverviewCmPulse(sortMode, signal),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    placeholderData: (previousData) => previousData,
  });

  const costsQuery = useQuery({
    queryKey: qk.overview.costs(),
    queryFn: ({ signal }) => fetchOverviewCosts(signal),
    staleTime: 300_000,
    gcTime: 600_000,
    refetchOnWindowFocus: false,
    placeholderData: (previousData) => previousData,
  });

  const data = useMemo(() => {
    if (
      !metricsQuery.data ||
      !attentionQuery.data ||
      !cmPulseQuery.data ||
      !costsQuery.data
    ) {
      return null;
    }

    return {
      metrics: metricsQuery.data.metrics,
      cmPulse: cmPulseQuery.data.cmPulse,
      attentionItems: attentionQuery.data.attentionItems,
      topAttention: attentionQuery.data.attentionItems.slice(0, 3),
      snoozedAttentionItems: attentionQuery.data.snoozedAttentionItems,
      snoozedCount: attentionQuery.data.snoozedCount,
      costs: costsQuery.data,
      attentionFeedSeenAt: attentionQuery.data.attentionFeedSeenAt,
    };
  }, [attentionQuery.data, cmPulseQuery.data, costsQuery.data, metricsQuery.data]);

  const error =
    metricsQuery.error ??
    attentionQuery.error ??
    cmPulseQuery.error ??
    costsQuery.error ??
    null;

  return {
    data,
    error,
    isLoading:
      metricsQuery.isLoading ||
      attentionQuery.isLoading ||
      cmPulseQuery.isLoading ||
      costsQuery.isLoading,
    isFetching:
      metricsQuery.isFetching ||
      attentionQuery.isFetching ||
      cmPulseQuery.isFetching ||
      costsQuery.isFetching,
    metricsQuery,
    attentionQuery,
    cmPulseQuery,
    costsQuery,
  };
}
