import { describe, expect, it } from 'vitest';
import {
  envFilterLabel,
  parseMonthlyPriceSekInput,
  resolveConcreteBillingEnv,
  subscriptionMonthlyPriceSek,
} from '@/lib/admin/billing';

describe('envFilterLabel', () => {
  it('returns a localized label for all environments', () => {
    expect(envFilterLabel('all')).toBe('Alla miljöer');
    expect(envFilterLabel('live')).toBe('LIVE');
  });
});

describe('resolveConcreteBillingEnv', () => {
  it('keeps concrete environments unchanged', () => {
    expect(resolveConcreteBillingEnv('test', 'live')).toBe('test');
    expect(resolveConcreteBillingEnv('live', 'test')).toBe('live');
  });

  it('falls back from all to the provided environment', () => {
    expect(resolveConcreteBillingEnv('all', 'test')).toBe('test');
    expect(resolveConcreteBillingEnv('all', 'live')).toBe('live');
  });
});

describe('subscriptionMonthlyPriceSek', () => {
  it('keeps monthly subscription amounts unchanged', () => {
    expect(
      subscriptionMonthlyPriceSek({
        amount: 990_000,
        interval: 'month',
        interval_count: 1,
      }),
    ).toBe(9900);
  });

  it('normalizes quarterly subscription amounts to a monthly sek value', () => {
    expect(
      subscriptionMonthlyPriceSek({
        amount: 2_970_000,
        interval: 'month',
        interval_count: 3,
      }),
    ).toBe(9900);
  });

  it('normalizes yearly subscription amounts to a monthly sek value', () => {
    expect(
      subscriptionMonthlyPriceSek({
        amount: 11_880_000,
        interval: 'year',
        interval_count: 1,
      }),
    ).toBe(9900);
  });
});

describe('parseMonthlyPriceSekInput', () => {
  it('returns an integer for whole-number sek input', () => {
    expect(parseMonthlyPriceSekInput('9900')).toBe(9900);
  });

  it('returns null for blank input', () => {
    expect(parseMonthlyPriceSekInput('   ')).toBeNull();
  });

  it('rejects decimal input instead of rounding it', () => {
    expect(parseMonthlyPriceSekInput('999.5')).toBeNaN();
    expect(parseMonthlyPriceSekInput('999,5')).toBeNaN();
  });

  it('rejects non-numeric input', () => {
    expect(parseMonthlyPriceSekInput('99 kr')).toBeNaN();
  });
});
