import { describe, expect, it } from 'vitest';
import { sortAttention, type AttentionItem } from './attention';

describe('attention', () => {
  it('prioritizes urgent notifications and old invoices', () => {
    const items: AttentionItem[] = [
      { kind: 'customer_blocked', id: 'blocked', customerId: 'c1', daysBlocked: 12, subjectType: 'customer_blocking', subjectId: 'c1' },
      { kind: 'invoice_unpaid', id: 'invoice', customerId: 'c2', daysPastDue: 20, amount_ore: 100_000, subjectType: 'invoice', subjectId: 'in_123' },
      { kind: 'cm_notification', id: 'notification', priority: 'urgent', createdAt: new Date(), from: 'CM', message: 'Help', customerId: null, subjectType: 'cm_notification', subjectId: 'notification' },
    ];

    const sorted = sortAttention(items);
    expect(sorted[0]?.kind).toBe('cm_notification');
    expect(sorted[1]?.kind).toBe('invoice_unpaid');
  });
});
