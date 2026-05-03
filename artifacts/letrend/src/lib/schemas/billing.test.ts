import { describe, expect, it } from 'vitest';
import {
  billingDiscountSchema,
  deriveBillingDiscountDurationMonths,
  hasBillingDiscountSpecificPeriod,
  subscriptionPriceChangeSchema,
} from '@/lib/schemas/billing';

describe('subscriptionPriceChangeSchema', () => {
  it('accepts a valid monthly price change payload', () => {
    const result = subscriptionPriceChangeSchema.safeParse({
      monthly_price: 9900,
      mode: 'now',
    });

    expect(result.success).toBe(true);
  });

  it('rejects zero monthly price', () => {
    const result = subscriptionPriceChangeSchema.safeParse({
      monthly_price: 0,
      mode: 'now',
    });

    expect(result.success).toBe(false);
  });

  it('rejects non-integer monthly price', () => {
    const result = subscriptionPriceChangeSchema.safeParse({
      monthly_price: 999.5,
      mode: 'next_period',
    });

    expect(result.success).toBe(false);
  });

  it('rejects invalid mode', () => {
    const result = subscriptionPriceChangeSchema.safeParse({
      monthly_price: 9900,
      mode: 'later',
    });

    expect(result.success).toBe(false);
  });
});

describe('billingDiscountSchema', () => {
  it('accepts a valid percent discount', () => {
    const result = billingDiscountSchema.safeParse({
      type: 'percent',
      value: 25,
      ongoing: false,
      duration_months: 3,
      start_date: null,
      end_date: null,
    });

    expect(result.success).toBe(true);
  });

  it('rejects a limited percent discount without duration', () => {
    const result = billingDiscountSchema.safeParse({
      type: 'percent',
      value: 25,
      ongoing: false,
      duration_months: null,
      start_date: null,
      end_date: null,
    });

    expect(result.success).toBe(false);
  });

  it('rejects percent discount above 100', () => {
    const result = billingDiscountSchema.safeParse({
      type: 'percent',
      value: 101,
      ongoing: false,
      duration_months: 3,
      start_date: null,
      end_date: null,
    });

    expect(result.success).toBe(false);
  });

  it('accepts a valid fixed amount discount', () => {
    const result = billingDiscountSchema.safeParse({
      type: 'amount',
      value: 1500,
      ongoing: true,
      duration_months: null,
      start_date: null,
      end_date: null,
    });

    expect(result.success).toBe(true);
  });

  it('accepts a period-based amount discount', () => {
    const result = billingDiscountSchema.safeParse({
      type: 'amount',
      value: 500,
      ongoing: false,
      duration_months: null,
      start_date: '2026-04-01',
      end_date: '2026-06-30',
    });

    expect(result.success).toBe(true);
  });

  it('rejects non-positive amount discount', () => {
    const result = billingDiscountSchema.safeParse({
      type: 'amount',
      value: 0,
      ongoing: false,
      duration_months: 2,
      start_date: null,
      end_date: null,
    });

    expect(result.success).toBe(false);
  });

  it('accepts a valid free-months discount without value', () => {
    const result = billingDiscountSchema.safeParse({
      type: 'free_months',
      duration_months: 2,
      start_date: null,
      end_date: null,
    });

    expect(result.success).toBe(true);
  });

  it('rejects free-months discount without duration', () => {
    const result = billingDiscountSchema.safeParse({
      type: 'free_months',
      start_date: null,
      end_date: null,
    });

    expect(result.success).toBe(false);
  });

  it('rejects malformed discount dates', () => {
    const result = billingDiscountSchema.safeParse({
      type: 'percent',
      value: 20,
      ongoing: false,
      duration_months: 2,
      start_date: '22-04-2026',
      end_date: null,
    });

    expect(result.success).toBe(false);
  });

  it('rejects a future start date for specific periods', () => {
    const nextYear = new Date().getFullYear() + 1;
    const result = billingDiscountSchema.safeParse({
      type: 'percent',
      value: 20,
      ongoing: false,
      duration_months: null,
      start_date: `${nextYear}-01-01`,
      end_date: `${nextYear}-02-01`,
    });

    expect(result.success).toBe(false);
  });

  it('rejects mixing specific period with duration months', () => {
    const result = billingDiscountSchema.safeParse({
      type: 'amount',
      value: 500,
      ongoing: false,
      duration_months: 2,
      start_date: '2026-04-01',
      end_date: '2026-05-01',
    });

    expect(result.success).toBe(false);
  });
});

describe('deriveBillingDiscountDurationMonths', () => {
  it('returns null for ongoing discounts', () => {
    expect(
      deriveBillingDiscountDurationMonths({
        type: 'percent',
        value: 10,
        ongoing: true,
        duration_months: null,
        start_date: null,
        end_date: null,
      }),
    ).toBeNull();
  });

  it('returns explicit duration months when present', () => {
    expect(
      deriveBillingDiscountDurationMonths({
        type: 'amount',
        value: 500,
        ongoing: false,
        duration_months: 3,
        start_date: null,
        end_date: null,
      }),
    ).toBe(3);
  });

  it('derives duration months from a specific period', () => {
    expect(
      deriveBillingDiscountDurationMonths({
        type: 'percent',
        value: 15,
        ongoing: false,
        duration_months: null,
        start_date: '2026-04-01',
        end_date: '2026-06-30',
      }),
    ).toBe(3);
  });

  it('returns free-month durations directly', () => {
    expect(
      deriveBillingDiscountDurationMonths({
        type: 'free_months',
        duration_months: 2,
        start_date: null,
        end_date: null,
      }),
    ).toBe(2);
  });
});

describe('hasBillingDiscountSpecificPeriod', () => {
  it('returns true when both dates are present for a limited discount', () => {
    expect(
      hasBillingDiscountSpecificPeriod({
        ongoing: false,
        startDate: '2026-04-01',
        endDate: '2026-04-30',
      }),
    ).toBe(true);
  });

  it('returns false for ongoing discounts even if dates are present', () => {
    expect(
      hasBillingDiscountSpecificPeriod({
        ongoing: true,
        startDate: '2026-04-01',
        endDate: '2026-04-30',
      }),
    ).toBe(false);
  });

  it('returns false when one of the dates is missing', () => {
    expect(
      hasBillingDiscountSpecificPeriod({
        ongoing: false,
        startDate: '2026-04-01',
        endDate: null,
      }),
    ).toBe(false);
  });
});
