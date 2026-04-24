import { describe, expect, it, vi } from 'vitest';
import {
  customerMutationRefreshScopes,
  invalidateAdminScopes,
  resolveAdminInvalidateQueryKeys,
} from '@/lib/admin/invalidate';
import { qk } from '@/lib/admin/queryKeys';

describe('resolveAdminInvalidateQueryKeys', () => {
  it('dedupes overlapping keys from combined scopes', () => {
    expect(
      resolveAdminInvalidateQueryKeys([
        'billing',
        { type: 'customer-billing', customerId: 'cust_1' },
      ]),
    ).toEqual([
      qk.billing.all(),
      qk.overview.all(),
      qk.customers.detail('cust_1'),
      qk.customers.invoices('cust_1'),
      qk.customers.subscription('cust_1'),
      qk.customers.pendingItems('cust_1'),
    ]);
  });

  it('keeps full customer refresh on the customer domain root key', () => {
    expect(
      resolveAdminInvalidateQueryKeys([{ type: 'customer', customerId: 'cust_1' }]),
    ).toEqual([qk.customers.all()]);
  });

  it('uses a true notifications root key for broad invalidation', () => {
    expect(resolveAdminInvalidateQueryKeys(['notifications'])).toEqual([
      qk.notifications.all(),
      qk.overview.all(),
    ]);
  });
});

describe('invalidateAdminScopes', () => {
  it('invalidates each resolved query key once', async () => {
    const invalidateQueries = vi.fn().mockResolvedValue(undefined);

    await invalidateAdminScopes(
      {
        invalidateQueries,
      } as never,
      ['billing', { type: 'customer-billing', customerId: 'cust_1' }],
    );

    expect(invalidateQueries).toHaveBeenCalledTimes(6);
    expect(invalidateQueries).toHaveBeenNthCalledWith(1, {
      queryKey: qk.billing.all(),
    });
    expect(invalidateQueries).toHaveBeenNthCalledWith(2, {
      queryKey: qk.overview.all(),
    });
    expect(invalidateQueries).toHaveBeenNthCalledWith(3, {
      queryKey: qk.customers.detail('cust_1'),
    });
    expect(invalidateQueries).toHaveBeenNthCalledWith(4, {
      queryKey: qk.customers.invoices('cust_1'),
    });
    expect(invalidateQueries).toHaveBeenNthCalledWith(5, {
      queryKey: qk.customers.subscription('cust_1'),
    });
    expect(invalidateQueries).toHaveBeenNthCalledWith(6, {
      queryKey: qk.customers.pendingItems('cust_1'),
    });
  });
});

describe('customerMutationRefreshScopes', () => {
  it('maps billing actions to billing, overview and customer scopes', () => {
    expect(
      customerMutationRefreshScopes('cust_1', 'change_subscription_price'),
    ).toEqual(['billing', 'overview', { type: 'customer', customerId: 'cust_1' }]);
  });

  it('maps assignment actions to team, overview and customer scopes', () => {
    expect(customerMutationRefreshScopes('cust_1', 'change_account_manager')).toEqual([
      'team',
      'overview',
      { type: 'customer', customerId: 'cust_1' },
    ]);
  });

  it('keeps generic customer actions on the customer scope', () => {
    expect(customerMutationRefreshScopes('cust_1', 'send_reminder')).toEqual([
      { type: 'customer', customerId: 'cust_1' },
    ]);
  });
});
