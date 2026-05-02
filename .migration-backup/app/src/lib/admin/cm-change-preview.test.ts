import { describe, expect, it } from 'vitest';
import { calculateCmChangePreview } from '@/lib/admin/cm-change-preview';

const current = {
  id: 'cm-current',
  name: 'Nuvarande',
  commission_rate: 0.2,
};

const next = {
  id: 'cm-next',
  name: 'Nästa',
  commission_rate: 0.2,
};

describe('calculateCmChangePreview', () => {
  it('returns zero current days when effective date is on the period start', () => {
    const preview = calculateCmChangePreview({
      mode: 'scheduled',
      effective_date: '2026-03-25',
      current_monthly_price: 9900,
      current,
      next,
    });

    expect(preview?.current.days).toBe(0);
    expect(preview?.next.days).toBe(preview?.period.total_days);
  });

  it('opens a new period cleanly on the next anchor date', () => {
    const preview = calculateCmChangePreview({
      mode: 'scheduled',
      effective_date: '2026-04-25',
      current_monthly_price: 9900,
      current,
      next,
    });

    expect(preview?.current.days).toBe(0);
    expect(preview?.next.days).toBe(preview?.period.total_days);
  });

  it('does not crash when coverage end date is before effective date', () => {
    const preview = calculateCmChangePreview({
      mode: 'temporary',
      effective_date: '2026-04-20',
      coverage_end_date: '2026-04-19',
      compensation_mode: 'covering_cm',
      current_monthly_price: 9900,
      current,
      next,
    });

    expect(preview?.next.days).toBe(0);
  });

  it('retains payout on the current CM for temporary primary payout mode', () => {
    const preview = calculateCmChangePreview({
      mode: 'temporary',
      effective_date: '2026-04-20',
      coverage_end_date: '2026-04-24',
      compensation_mode: 'primary_cm',
      current_monthly_price: 9900,
      current,
      next,
    });

    expect(preview?.next.payout_ore).toBe(0);
    expect(preview?.retained_payout_ore).toBeGreaterThan(0);
  });

  it('returns null for zero monthly price', () => {
    const preview = calculateCmChangePreview({
      mode: 'scheduled',
      effective_date: '2026-04-20',
      current_monthly_price: 0,
      current,
      next,
    });

    expect(preview).toBeNull();
  });

  it('is stable across leap year and month shift dates', () => {
    const leapPreview = calculateCmChangePreview({
      mode: 'scheduled',
      effective_date: '2024-02-29',
      current_monthly_price: 9900,
      current,
      next,
    });
    const monthShiftPreview = calculateCmChangePreview({
      mode: 'scheduled',
      effective_date: '2026-03-01',
      current_monthly_price: 9900,
      current,
      next,
    });

    expect(leapPreview?.period.total_days).toBeGreaterThan(0);
    expect(monthShiftPreview?.period.total_days).toBeGreaterThan(0);
  });
});
