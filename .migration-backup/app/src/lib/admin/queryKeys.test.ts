import { describe, expect, it } from 'vitest';
import { qk } from '@/lib/admin/queryKeys';

describe('query keys', () => {
  it('stabilizes customer list filters across property order', () => {
    expect(
      qk.customers.list({
        q: 'hagen',
        status: 'active',
        page: 2,
      }),
    ).toEqual(
      qk.customers.list({
        page: 2,
        status: 'active',
        q: 'hagen',
      }),
    );
  });

  it('stabilizes billing filters across property order', () => {
    expect(
      qk.billing.invoices('live', {
        status: 'open',
        page: 3,
        from: '2026-04-01',
      }),
    ).toEqual(
      qk.billing.invoices('live', {
        from: '2026-04-01',
        page: 3,
        status: 'open',
      }),
    );
  });

  it('does not mix customer detail and subscription keys', () => {
    expect(qk.customers.detail('cust_1')).not.toEqual(qk.customers.subscription('cust_1'));
  });

  it('keeps a separate notifications root and filtered list key', () => {
    expect(qk.notifications.all()).not.toEqual(qk.notifications.list({ unread: true }));
  });

  it('keeps unread count distinct from list keys', () => {
    expect(qk.notifications.unreadCount()).not.toEqual(
      qk.notifications.list({ unread: true }),
    );
  });
});
