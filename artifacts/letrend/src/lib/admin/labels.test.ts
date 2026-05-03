import { describe, expect, it } from 'vitest';
import { subscriptionStatusConfig } from '@/lib/admin/labels';

describe('subscriptionStatusConfig', () => {
  it('returns active label for active subscriptions', () => {
    expect(subscriptionStatusConfig('active')).toEqual({
      label: 'Aktiv',
      className: 'bg-success/10 text-success',
    });
  });

  it('returns trial label for trialing subscriptions', () => {
    expect(subscriptionStatusConfig('trialing')).toEqual({
      label: 'Provperiod',
      className: 'bg-info/10 text-info',
    });
  });

  it('returns paused label when paused flag is set', () => {
    expect(subscriptionStatusConfig({ status: 'active', paused: true })).toEqual({
      label: 'Pausad',
      className: 'bg-warning/10 text-warning',
    });
  });

  it('returns ending label when cancel at period end is set', () => {
    expect(
      subscriptionStatusConfig({
        status: 'active',
        cancel_at_period_end: true,
      }),
    ).toEqual({
      label: 'Avslutas',
      className: 'bg-warning/10 text-warning',
    });
  });

  it('returns canceled label for canceled subscriptions', () => {
    expect(subscriptionStatusConfig('canceled')).toEqual({
      label: 'Avslutad',
      className: 'bg-muted text-muted-foreground',
    });
  });

  it('returns canceled label for cancelled subscriptions', () => {
    expect(subscriptionStatusConfig('cancelled')).toEqual({
      label: 'Avslutad',
      className: 'bg-muted text-muted-foreground',
    });
  });

  it('returns incomplete label for incomplete subscriptions', () => {
    expect(subscriptionStatusConfig('incomplete')).toEqual({
      label: 'Ofullständig',
      className: 'bg-warning/10 text-warning',
    });
  });

  it('returns past due label for past due subscriptions', () => {
    expect(subscriptionStatusConfig('past_due')).toEqual({
      label: 'Förfallen',
      className: 'bg-destructive/10 text-destructive',
    });
  });

  it('prefers cancel at period end over paused flag', () => {
    expect(
      subscriptionStatusConfig({
        status: 'paused',
        paused: true,
        cancel_at_period_end: true,
      }),
    ).toEqual({
      label: 'Avslutas',
      className: 'bg-warning/10 text-warning',
    });
  });

  it('falls back to raw status for unknown values', () => {
    expect(subscriptionStatusConfig('custom_status')).toEqual({
      label: 'custom_status',
      className: 'bg-muted text-muted-foreground',
    });
  });
});
