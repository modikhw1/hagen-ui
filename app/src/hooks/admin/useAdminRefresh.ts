'use client';

import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import type { EnvFilter } from '@/lib/admin/billing';
import {
  invalidateAfterCustomerWrite,
  invalidateBilling,
} from '@/lib/admin/invalidate';
import { qk } from '@/lib/admin/queryKeys';

export function useCustomerRouteRefresh(customerId: string) {
  const router = useRouter();
  const queryClient = useQueryClient();

  return async () => {
    await Promise.all([
      invalidateAfterCustomerWrite(queryClient, customerId),
      invalidateBilling(queryClient),
    ]);

    router.refresh();
  };
}

export function useOverviewRefresh() {
  const router = useRouter();
  const queryClient = useQueryClient();

  return async (customerId?: string | null) => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: qk.overview.main() }),
      customerId
        ? queryClient.invalidateQueries({ queryKey: qk.customers.detail(customerId) })
        : Promise.resolve(),
    ]);
    router.refresh();
  };
}

export function useBillingInvoicesRefresh(env: EnvFilter) {
  const router = useRouter();
  const queryClient = useQueryClient();

  return async () => {
    await invalidateBilling(queryClient, env);
    router.refresh();
  };
}

export function useBillingSubscriptionsRefresh(env: EnvFilter) {
  const router = useRouter();
  const queryClient = useQueryClient();

  return async () => {
    await invalidateBilling(queryClient, env);
    router.refresh();
  };
}

export function usePendingInvoiceItemsRefresh(customerId: string) {
  const router = useRouter();
  const queryClient = useQueryClient();

  return async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: qk.customers.pendingItems(customerId) }),
      queryClient.invalidateQueries({ queryKey: qk.customers.invoices(customerId) }),
    ]);
    router.refresh();
  };
}
