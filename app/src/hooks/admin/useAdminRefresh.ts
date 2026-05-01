'use client';

import { useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import {
  invalidateAdminScopes,
  type AdminRefreshScope,
} from '@/lib/admin/invalidate';

export function useAdminRefresh() {
  const router = useRouter();
  const queryClient = useQueryClient();

  return useCallback(
    async (scopes: readonly AdminRefreshScope[] = []) => {
      await invalidateAdminScopes(queryClient, scopes);
      router.refresh();
    },
    [queryClient, router],
  );
}

export function useCustomerRouteRefresh(customerId: string) {
  const refresh = useAdminRefresh();

  return useCallback(
    async () => {
      await refresh([{ type: 'customer', customerId }]);
    },
    [customerId, refresh],
  );
}

export function useCustomerBillingRefresh(customerId: string) {
  const refresh = useAdminRefresh();

  return useCallback(
    async () => {
      await refresh([{ type: 'customer-billing', customerId }]);
    },
    [customerId, refresh],
  );
}

export function useCustomerAssignmentRefresh(customerId: string) {
  const refresh = useAdminRefresh();

  return useCallback(
    async () => {
      await refresh([{ type: 'customer-assignment', customerId }]);
    },
    [customerId, refresh],
  );
}

export function useOverviewRefresh() {
  const refresh = useAdminRefresh();

  return useCallback(
    async (customerId?: string | null) => {
      await refresh(
        customerId
          ? ['overview', { type: 'customer', customerId }]
          : ['overview'],
      );
    },
    [refresh],
  );
}

export function useBillingInvoicesRefresh() {
  const refresh = useAdminRefresh();

  return useCallback(
    async () => {
      await refresh(['billing']);
    },
    [refresh],
  );
}

export function useBillingSubscriptionsRefresh() {
  const refresh = useAdminRefresh();

  return useCallback(
    async () => {
      await refresh(['billing']);
    },
    [refresh],
  );
}

export function usePendingInvoiceItemsRefresh(customerId: string) {
  const refresh = useAdminRefresh();

  return useCallback(
    async () => {
      await refresh([{ type: 'pending-invoice-items', customerId }]);
    },
    [customerId, refresh],
  );
}
