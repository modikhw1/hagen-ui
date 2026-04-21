'use client';

import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import type { EnvFilter } from '@/lib/admin/billing';
import { customerKeys, qk } from '@/hooks/admin/cache-keys';

export function useCustomerRouteRefresh(customerId: string) {
  const router = useRouter();
  const queryClient = useQueryClient();

  return async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: customerKeys.detail(customerId) }),
      queryClient.invalidateQueries({ queryKey: customerKeys.invoices(customerId) }),
      queryClient.invalidateQueries({ queryKey: customerKeys.tiktok(customerId) }),
      queryClient.invalidateQueries({ queryKey: customerKeys.activity(customerId) }),
      queryClient.invalidateQueries({ queryKey: customerKeys.pendingItems(customerId) }),
      queryClient.invalidateQueries({ queryKey: customerKeys.subscription(customerId) }),
      queryClient.invalidateQueries({ queryKey: ['admin', 'customers'] }),
      queryClient.invalidateQueries({ queryKey: qk.billing.subscriptions('all') }),
      queryClient.invalidateQueries({ queryKey: qk.billing.invoices('all') }),
      queryClient.invalidateQueries({ queryKey: qk.overviewRoot() }),
    ]);

    router.refresh();
  };
}

export function useOverviewRefresh() {
  const router = useRouter();
  const queryClient = useQueryClient();

  return async (customerId?: string | null) => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: qk.overviewRoot() }),
      customerId ? queryClient.invalidateQueries({ queryKey: customerKeys.detail(customerId) }) : Promise.resolve(),
    ]);
    router.refresh();
  };
}

export function useBillingInvoicesRefresh(env: EnvFilter) {
  const router = useRouter();
  const queryClient = useQueryClient();

  return async () => {
    await queryClient.invalidateQueries({ queryKey: qk.billing.invoices(env) });
    router.refresh();
  };
}

export function useBillingSubscriptionsRefresh(env: EnvFilter) {
  const router = useRouter();
  const queryClient = useQueryClient();

  return async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: qk.billing.subscriptions(env) }),
      queryClient.invalidateQueries({ queryKey: qk.billing.invoices(env) }),
    ]);
    router.refresh();
  };
}

export function usePendingInvoiceItemsRefresh(customerId: string) {
  const router = useRouter();
  const queryClient = useQueryClient();

  return async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: customerKeys.pendingItems(customerId) }),
      queryClient.invalidateQueries({ queryKey: customerKeys.invoices(customerId) }),
    ]);
    router.refresh();
  };
}
