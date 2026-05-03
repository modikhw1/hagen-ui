import { vi } from 'vitest';
import { describe, expect, it } from 'vitest';
import type Stripe from 'stripe';
import {
  extractNextSchedulePhase,
  monthlyPriceOreFromSchedulePhaseItem,
  subscriptionHasPromotedScheduledPrice,
} from './customer-billing-store';

vi.mock('server-only', () => ({}));

describe('customer-billing-store helpers', () => {
  it('selects the next future schedule phase first', () => {
    const now = Math.floor(Date.now() / 1000);
    const schedule = {
      phases: [
        { start_date: now - 86_400, end_date: now + 86_400, items: [] },
        { start_date: now + 86_400, end_date: now + 172_800, items: [] },
      ],
    } as unknown as Stripe.SubscriptionSchedule;

    const nextPhase = extractNextSchedulePhase(schedule);

    expect(nextPhase?.start_date).toBe(now + 86_400);
  });

  it('detects when a subscription has promoted the scheduled monthly price', () => {
    expect(
      subscriptionHasPromotedScheduledPrice({
        currentMonthlyPriceOre: 12_500,
        upcomingPriceSek: 125,
      }),
    ).toBe(true);
    expect(
      subscriptionHasPromotedScheduledPrice({
        currentMonthlyPriceOre: 9_900,
        upcomingPriceSek: 125,
      }),
    ).toBe(false);
  });

  it('derives monthly ore from a quarterly phase item price', () => {
    const item = {
      price: {
        id: 'price_quarterly',
        unit_amount: 36_000,
        recurring: {
          interval: 'month',
          interval_count: 3,
        },
      },
    } as unknown as Stripe.SubscriptionSchedule.Phase.Item;

    expect(monthlyPriceOreFromSchedulePhaseItem(item)).toBe(12_000);
  });
});
