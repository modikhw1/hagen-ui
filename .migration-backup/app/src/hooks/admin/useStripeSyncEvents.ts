'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/admin/api-client';
import { qk } from '@/lib/admin/queryKeys';

export type StripeSyncEventStatus = 'received' | 'applied' | 'skipped' | 'failed';
export type StripeSyncEventSource = 'webhook' | 'manual_resync' | 'reconcile_job' | 'app_action';

export interface StripeSyncEvent {
  id: string;
  stripe_event_id: string | null;
  event_type: string;
  object_type: string | null;
  object_id: string | null;
  source: StripeSyncEventSource;
  status: StripeSyncEventStatus;
  applied_changes: Record<string, unknown>;
  error_message: string | null;
  received_at: string;
  processed_at: string | null;
  environment: 'test' | 'live' | null;
}

/**
 * Hämtar de senaste Stripe-sync-events för en kund.
 * Används av kundens billing-tab och cockpit-vyn för att visa "vad har hänt
 * med kundens fakturor/abb senast" — inkl. ändringar gjorda direkt i Stripe Dashboard.
 */
export function useStripeSyncEvents(customerId: string | null | undefined, limit = 50) {
  return useQuery({
    queryKey: qk.customers.syncEvents(customerId ?? 'none', limit),
    enabled: Boolean(customerId),
    queryFn: async ({ signal }) => {
      const result = await apiClient.get<{ events: StripeSyncEvent[] }>(
        `/api/admin/customers/${customerId}/billing/sync-events`,
        { query: { limit }, signal },
      );
      return result.events;
    },
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });
}

/**
 * Force-resync av all Stripe-data för en kund.
 * Hämtar fresh customer/subscriptions/invoices från Stripe och skriver över
 * de lokala speglingarna. Loggas till stripe_sync_events med source='manual_resync'.
 */
export function useResyncCustomerStripe(customerId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      return apiClient.post<{ ok: boolean; summary: { subscriptions_synced: number; invoices_synced: number; errors: string[] } }>(
        `/api/admin/customers/${customerId}/billing/resync`,
        {},
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.customers.detail(customerId) });
      queryClient.invalidateQueries({ queryKey: qk.customers.invoices(customerId) });
      queryClient.invalidateQueries({ queryKey: qk.customers.subscription(customerId) });
      queryClient.invalidateQueries({ queryKey: ['admin', 'customers', customerId, 'sync-events'] });
    },
  });
}