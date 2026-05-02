import { describe, expect, it } from 'vitest';
import { activeCustomersCard, costsCard, demosCard, monthlyRevenueCard, type OverviewInput } from './overview-cards';

function makeInput(): OverviewInput {
  return {
    activeSubscriptions: [
      { mrr_ore: 100_000, created_at: new Date('2026-03-01'), canceled_at: null },
      { mrr_ore: 50_000, created_at: new Date('2026-04-10'), canceled_at: null },
    ],
    customers: [
      { id: '1', status: 'active', activated_at: new Date('2026-04-05'), churned_at: null },
      { id: '2', status: 'active', activated_at: new Date('2026-03-10'), churned_at: null },
      { id: '3', status: 'churned', activated_at: new Date('2026-03-02'), churned_at: new Date('2026-04-12') },
    ],
    demos: [
      { id: 'a', status: 'sent', status_changed_at: new Date('2026-04-12'), resolved_at: null },
      { id: 'b', status: 'won', status_changed_at: new Date('2026-04-11'), resolved_at: new Date('2026-04-11') },
    ],
    costs30d_ore: 12_500,
    now: new Date('2026-04-17'),
  };
}

describe('overview-cards', () => {
  it('derives monthly revenue delta', () => {
    const card = monthlyRevenueCard(makeInput());
    expect(card.value).toBe('1 500 kr');
    expect(card.delta?.text).toBe('+500 kr');
  });

  it('derives active customer card', () => {
    const card = activeCustomersCard(makeInput());
    expect(card.value).toBe('2');
    expect(card.delta).toBeUndefined();
  });

  it('derives demos and costs cards', () => {
    expect(demosCard(makeInput()).sub).toBe('1 konverterade');
    expect(costsCard(makeInput()).value).toBe('125 kr');
  });
});
