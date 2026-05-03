import { describe, expect, it } from 'vitest';
import { parseBillingSearchParams } from '@/lib/admin/billing-search-params';

describe('parseBillingSearchParams', () => {
  it('defaults to all env, all invoice status, active subscription status and page 1', () => {
    expect(parseBillingSearchParams({})).toEqual({
      env: 'all',
      invoiceStatus: 'all',
      subscriptionStatus: 'active',
      page: 1,
    });
  });

  it('keeps valid env and page', () => {
    expect(
      parseBillingSearchParams({
        env: 'live',
        page: '3',
      }),
    ).toEqual({
      env: 'live',
      invoiceStatus: 'all',
      subscriptionStatus: 'active',
      page: 3,
    });
  });

  it('reads invoice status from invoiceStatus query param', () => {
    expect(
      parseBillingSearchParams({
        invoiceStatus: 'paid',
      }),
    ).toEqual({
      env: 'all',
      invoiceStatus: 'paid',
      subscriptionStatus: 'active',
      page: 1,
    });
  });

  it('reads subscription status from subscriptionStatus query param', () => {
    expect(
      parseBillingSearchParams({
        subscriptionStatus: 'expiring',
      }),
    ).toEqual({
      env: 'all',
      invoiceStatus: 'all',
      subscriptionStatus: 'expiring',
      page: 1,
    });
  });

  it('supports both invoiceStatus and subscriptionStatus simultaneously', () => {
    expect(
      parseBillingSearchParams({
        invoiceStatus: 'open',
        subscriptionStatus: 'paused',
      }),
    ).toEqual({
      env: 'all',
      invoiceStatus: 'open',
      subscriptionStatus: 'paused',
      page: 1,
    });
  });

  it('reads first value from array params', () => {
    expect(
      parseBillingSearchParams({
        env: ['live', 'test'],
        invoiceStatus: ['open', 'paid'],
        subscriptionStatus: ['active', 'paused'],
        page: ['2', '4'],
      }),
    ).toEqual({
      env: 'live',
      invoiceStatus: 'open',
      subscriptionStatus: 'active',
      page: 2,
    });
  });

  it('falls back for invalid env and page values', () => {
    expect(
      parseBillingSearchParams({
        env: 'preview',
        page: '0',
      }),
    ).toEqual({
      env: 'all',
      invoiceStatus: 'all',
      subscriptionStatus: 'active',
      page: 1,
    });
  });

  it('falls back when page is non-numeric', () => {
    expect(
      parseBillingSearchParams({
        page: 'abc',
      }),
    ).toEqual({
      env: 'all',
      invoiceStatus: 'all',
      subscriptionStatus: 'active',
      page: 1,
    });
  });

  it('falls back when status params are unknown', () => {
    expect(
      parseBillingSearchParams({
        invoiceStatus: 'unknown',
        subscriptionStatus: 'unknown',
      }),
    ).toEqual({
      env: 'all',
      invoiceStatus: 'all',
      subscriptionStatus: 'active',
      page: 1,
    });
  });

  it('supports legacy status param for backwards compatibility', () => {
    expect(
      parseBillingSearchParams({
        status: 'partially_refunded',
      }),
    ).toEqual({
      env: 'all',
      invoiceStatus: 'partially_refunded',
      subscriptionStatus: 'active',
      page: 1,
    });
  });
});
