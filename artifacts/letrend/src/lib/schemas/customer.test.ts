import { describe, expect, it } from 'vitest';
import {
  createCustomerSchema,
  createCustomerServerSchema,
} from '@/lib/schemas/customer';

function buildPayload() {
  return {
    business_name: 'Cafe Rose',
    customer_contact_name: 'Maria Holm',
    contact_email: 'info@caferose.se',
    phone: '0701234567',
    tiktok_profile_url: 'https://www.tiktok.com/@caferose',
    account_manager: 'cm@letrend.se',
    pricing_status: 'fixed' as const,
    monthly_price: 9900,
    subscription_interval: 'month' as const,
    contract_start_date: '2026-04-22',
    billing_day_of_month: 25,
    waive_days_until_billing: false,
    send_invite_now: true,
    first_invoice_behavior: 'prorated' as const,
    discount_type: 'none' as const,
    discount_value: 0,
    discount_duration_months: 1,
    discount_start_date: null,
    discount_end_date: null,
    upcoming_monthly_price: null,
    upcoming_price_effective_date: null,
    invoice_text: null,
    scope_items: [],
    price_start_date: null,
    price_end_date: null,
    contacts: [],
    profile_data: {},
    game_plan: {},
    concepts: [],
  };
}

describe('createCustomerSchema', () => {
  it('accepts the current client payload', () => {
    const result = createCustomerSchema.safeParse(buildPayload());
    expect(result.success).toBe(true);
  });

  it('rejects legacy send_invite on the client schema', () => {
    const result = createCustomerSchema.safeParse({
      ...buildPayload(),
      send_invite: true,
    });

    expect(result.success).toBe(false);
  });

  it('requires a valid email', () => {
    const result = createCustomerSchema.safeParse({
      ...buildPayload(),
      contact_email: 'not-an-email',
    });

    expect(result.success).toBe(false);
  });
});

describe('createCustomerServerSchema', () => {
  it('normalizes legacy send_invite to send_invite_now', () => {
    const result = createCustomerServerSchema.safeParse({
      ...buildPayload(),
      send_invite_now: false,
      send_invite: true,
    });

    expect(result.success).toBe(true);
    expect(result.success && result.data.send_invite_now).toBe(true);
  });

  it('defaults send_invite_now to false when omitted', () => {
    const result = createCustomerServerSchema.safeParse({
      ...buildPayload(),
      send_invite_now: undefined,
    });
    expect(result.success).toBe(true);
    expect(result.success && result.data.send_invite_now).toBe(false);
  });

  it('rejects malformed billing day', () => {
    const result = createCustomerServerSchema.safeParse({
      ...buildPayload(),
      billing_day_of_month: 29,
    });

    expect(result.success).toBe(false);
  });
});
