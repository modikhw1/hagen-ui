'use client';

import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import type { EnvFilter } from '@/lib/admin/billing';
import {
  invalidateCustomerAssignment,
  invalidateCustomerBilling,
  invalidateCustomerRoute,
  invalidateBilling,
  invalidateOverview,
} from '@/lib/admin/invalidate';
import { qk } from '@/lib/admin/queryKeys';

export function useCustomerRouteRefresh(customerId: string) {
  const router = useRouter();
  const queryClient = useQueryClient();

  return async () => {
    await invalidateCustomerRoute(queryClient, customerId);
    router.refresh();
  };
}

export function useCustomerBillingRefresh(customerId: string) {
  const router = useRouter();
  const queryClient = useQueryClient();

  return async () => {
    await invalidateCustomerBilling(queryClient, customerId);
    router.refresh();
  };
}

export function useCustomerAssignmentRefresh(customerId: string) {
  const router = useRouter();
  const queryClient = useQueryClient();

  return async () => {
    await invalidateCustomerAssignment(queryClient, customerId);
    router.refresh();
  };
}

export function useOverviewRefresh() {
  const router = useRouter();
  const queryClient = useQueryClient();

  return async (customerId?: string | null) => {
    await invalidateOverview(queryClient, customerId);
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
