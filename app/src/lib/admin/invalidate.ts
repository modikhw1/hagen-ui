import type { QueryClient } from '@tanstack/react-query';
import type { EnvFilter } from '@/lib/admin/billing';
import { qk } from '@/lib/admin/queryKeys';

export function invalidateCustomerRoute(queryClient: QueryClient, id: string) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: qk.customers.detail(id) }),
    queryClient.invalidateQueries({ queryKey: qk.customers.tiktok(id) }),
    queryClient.invalidateQueries({ queryKey: qk.customers.activity(id) }),
  ]);
}

export function invalidateCustomerBilling(queryClient: QueryClient, id: string) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: qk.customers.detail(id) }),
    queryClient.invalidateQueries({ queryKey: qk.customers.invoices(id) }),
    queryClient.invalidateQueries({
      queryKey: qk.customers.subscription(id, null),
      exact: false,
    }),
    queryClient.invalidateQueries({ queryKey: qk.customers.pendingItems(id) }),
    queryClient.invalidateQueries({ queryKey: qk.customers.activity(id) }),
  ]);
}

export function invalidateCustomerAssignment(queryClient: QueryClient, id: string) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: qk.customers.detail(id) }),
    queryClient.invalidateQueries({ queryKey: qk.customers.list() }),
    queryClient.invalidateQueries({ queryKey: qk.team.list() }),
  ]);
}

export function invalidateBilling(queryClient: QueryClient, env?: EnvFilter) {
  if (env) {
    return Promise.all([
      queryClient.invalidateQueries({ queryKey: qk.billing.invoices(env) }),
      queryClient.invalidateQueries({ queryKey: qk.billing.subscriptions(env) }),
      queryClient.invalidateQueries({ queryKey: qk.billing.health() }),
    ]);
  }

  return Promise.all([
    queryClient.invalidateQueries({ queryKey: qk.billing.invoices('all') }),
    queryClient.invalidateQueries({ queryKey: qk.billing.invoices('test') }),
    queryClient.invalidateQueries({ queryKey: qk.billing.invoices('live') }),
    queryClient.invalidateQueries({ queryKey: qk.billing.subscriptions('all') }),
    queryClient.invalidateQueries({ queryKey: qk.billing.subscriptions('test') }),
    queryClient.invalidateQueries({ queryKey: qk.billing.subscriptions('live') }),
    queryClient.invalidateQueries({ queryKey: qk.billing.health() }),
  ]);
}

export function invalidateOverview(queryClient: QueryClient, customerId?: string | null) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: qk.overview.main() }),
    customerId
      ? queryClient.invalidateQueries({ queryKey: qk.customers.detail(customerId) })
      : Promise.resolve(),
  ]);
}
