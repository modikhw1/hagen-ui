import type { QueryClient, QueryKey } from '@tanstack/react-query';
import { qk } from '@/lib/admin/queryKeys';
import type { CustomerAction } from '@/lib/admin/schemas/customer-actions';

export type AdminRefreshScope =
  | 'customers'
  | { type: 'customer'; customerId: string }
  | { type: 'customer-light'; customerId: string }
  | { type: 'customer-billing'; customerId: string }
  | { type: 'customer-assignment'; customerId: string }
  | { type: 'pending-invoice-items'; customerId: string }
  | 'notifications'
  | 'demos'
  | 'payroll'
  | 'team'
  | 'billing'
  | 'overview'
  | {
      type: 'global';
      scope: 'overview' | 'billing' | 'team' | 'notifications' | 'payroll' | 'demos';
    };

export type CustomerMutationRefreshAction = CustomerAction['action'] | 'archive_customer';

type CustomerScope = Extract<AdminRefreshScope, { type: 'customer' }>;

function queryKeysForScope(scope: AdminRefreshScope): QueryKey[] {
  if (typeof scope === 'object' && scope.type === 'global') {
    return queryKeysForScope(scope.scope);
  }

  if (scope === 'customers') {
    return [qk.customers.all()];
  }

  if (scope === 'billing') {
    return [qk.billing.all(), qk.overview.all()];
  }

  if (scope === 'team') {
    return [qk.team.all()];
  }

  if (scope === 'overview') {
    return [qk.overview.all()];
  }

  if (scope === 'notifications') {
    return [qk.notifications.all(), qk.overview.all()];
  }

  if (scope === 'demos') {
    return [qk.demos.root(), qk.overview.all()];
  }

  if (scope === 'payroll') {
    return [qk.payroll.all()];
  }

  if (scope.type === 'customer') {
    return [qk.customers.all()];
  }

  if (scope.type === 'customer-light') {
    return [qk.customers.detail(scope.customerId)];
  }

  if (scope.type === 'customer-billing') {
    return [
      qk.customers.detail(scope.customerId),
      qk.customers.invoices(scope.customerId),
      qk.customers.subscription(scope.customerId),
      qk.customers.pendingItems(scope.customerId),
      qk.billing.all(),
      qk.overview.all(),
    ];
  }

  if (scope.type === 'customer-assignment') {
    return [
      qk.customers.detail(scope.customerId),
      qk.customers.cmCoverage(scope.customerId),
      qk.team.all(),
      qk.overview.all(),
    ];
  }

  if (scope.type === 'pending-invoice-items') {
    return [
      qk.customers.pendingItems(scope.customerId),
      qk.customers.invoices(scope.customerId),
    ];
  }

  return [];
}

export function resolveAdminInvalidateQueryKeys(scopes: readonly AdminRefreshScope[]) {
  const seen = new Set<string>();
  const queryKeys: QueryKey[] = [];

  for (const scope of scopes) {
    for (const queryKey of queryKeysForScope(scope)) {
      const cacheKey = JSON.stringify(queryKey);
      if (seen.has(cacheKey)) {
        continue;
      }

      seen.add(cacheKey);
      queryKeys.push(queryKey);
    }
  }

  return queryKeys;
}

export function invalidateAdminScopes(
  queryClient: QueryClient,
  scopes: readonly AdminRefreshScope[],
) {
  const customerScopes = scopes.filter(isCustomerScope);
  const nonCustomerScopes = scopes.filter((scope) => !isCustomerScope(scope));

  const operations: Array<Promise<unknown>> = [];
  if (customerScopes.length > 0) {
    operations.push(invalidateCustomerScopes(queryClient, customerScopes));
  }
  if (nonCustomerScopes.length > 0) {
    operations.push(
      Promise.all(
        resolveAdminInvalidateQueryKeys(nonCustomerScopes).map((queryKey) =>
          queryClient.invalidateQueries({ queryKey }),
        ),
      ),
    );
  }

  return Promise.all(operations);
}

function isCustomerScope(scope: AdminRefreshScope): scope is CustomerScope {
  return typeof scope === 'object' && scope.type === 'customer';
}

function shouldInvalidateCustomerQuery(queryKey: QueryKey, customerId: string) {
  if (!Array.isArray(queryKey) || queryKey.length < 2) {
    return false;
  }

  if (queryKey[0] !== 'admin' || queryKey[1] !== 'customers') {
    return false;
  }

  if (queryKey.length === 2) {
    return true;
  }

  const segment = queryKey[2];
  if (segment === 'list' || segment === 'buffer') {
    return true;
  }

  return queryKey.some((part) => part === customerId);
}

function invalidateCustomerScopes(
  queryClient: QueryClient,
  scopes: readonly CustomerScope[],
) {
  const customerIds = [...new Set(scopes.map((scope) => scope.customerId))];

  return Promise.all(
    customerIds.map((customerId) =>
      queryClient.invalidateQueries({
        queryKey: qk.customers.all(),
        predicate: (query) => shouldInvalidateCustomerQuery(query.queryKey, customerId),
      }),
    ),
  );
}

export function customerMutationRefreshScopes(
  customerId: string,
  action: CustomerMutationRefreshAction,
): readonly AdminRefreshScope[] {
  if (
    action === 'change_subscription_price' ||
    action === 'pause_subscription' ||
    action === 'resume_subscription' ||
    action === 'cancel_subscription' ||
    action === 'send_invite' ||
    action === 'activate' ||
    action === 'reactivate_archive'
  ) {
    return ['billing', 'overview', { type: 'customer', customerId }];
  }

  if (
    action === 'change_account_manager' ||
    action === 'set_temporary_coverage' ||
    action === 'archive_customer'
  ) {
    return ['team', 'overview', { type: 'customer', customerId }];
  }

  return [{ type: 'customer', customerId }];
}

export const invalidate = {
  customer(queryClient: QueryClient, id: string) {
    return invalidateAdminScopes(queryClient, [{ type: 'customer', customerId: id }]);
  },
  customerLight(queryClient: QueryClient, id: string) {
    return invalidateAdminScopes(queryClient, [{ type: 'customer-light', customerId: id }]);
  },
  customerBilling(queryClient: QueryClient, id: string) {
    return invalidateAdminScopes(queryClient, [{ type: 'customer-billing', customerId: id }]);
  },
  customerAssignment(queryClient: QueryClient, id: string) {
    return invalidateAdminScopes(queryClient, [{ type: 'customer-assignment', customerId: id }]);
  },
  team(queryClient: QueryClient) {
    return invalidateAdminScopes(queryClient, ['team']);
  },
  billing(queryClient: QueryClient) {
    return invalidateAdminScopes(queryClient, ['billing']);
  },
  overview(queryClient: QueryClient) {
    return invalidateAdminScopes(queryClient, ['overview']);
  },
};

export function invalidateCustomer(queryClient: QueryClient, id: string) {
  return invalidate.customer(queryClient, id);
}

export function invalidateTeam(queryClient: QueryClient) {
  return invalidate.team(queryClient);
}

export function invalidateCustomerRoute(queryClient: QueryClient, id: string) {
  return invalidate.customer(queryClient, id);
}

export function invalidateCustomerBilling(queryClient: QueryClient, id: string) {
  return invalidate.customerBilling(queryClient, id);
}

export function invalidateCustomerAssignment(queryClient: QueryClient, id: string) {
  return invalidate.customerAssignment(queryClient, id);
}

export function invalidateBilling(queryClient: QueryClient) {
  return invalidate.billing(queryClient);
}

export function invalidateAfterCustomerWrite(queryClient: QueryClient, id: string) {
  return invalidateAdminScopes(queryClient, [
    { type: 'customer', customerId: id },
    'overview',
  ]);
}

export function invalidateOverview(queryClient: QueryClient, customerId?: string | null) {
  return invalidateAdminScopes(
    queryClient,
    customerId
      ? ['overview', { type: 'customer', customerId }]
      : ['overview'],
  );
}
