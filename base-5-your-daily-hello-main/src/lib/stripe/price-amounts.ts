import type Stripe from 'stripe';

export function recurringUnitAmountFromMonthlySek(params: {
  monthlyPriceSek: number;
  interval: Stripe.Price.Recurring.Interval;
  intervalCount?: number | null;
}) {
  const monthlyOre = Math.round((Number(params.monthlyPriceSek) || 0) * 100);
  return recurringUnitAmountFromMonthlyOre({
    monthlyPriceOre: monthlyOre,
    interval: params.interval,
    intervalCount: params.intervalCount,
  });
}

export function recurringUnitAmountFromMonthlyOre(params: {
  monthlyPriceOre: number;
  interval: Stripe.Price.Recurring.Interval;
  intervalCount?: number | null;
}) {
  const monthlyOre = Math.round(Number(params.monthlyPriceOre) || 0);
  const intervalCount = Math.max(1, Number(params.intervalCount) || 1);

  if (params.interval === 'month') {
    return monthlyOre * intervalCount;
  }

  if (params.interval === 'year') {
    return monthlyOre * 12 * intervalCount;
  }

  return monthlyOre * intervalCount;
}

export function monthlyAmountOreFromRecurringUnit(params: {
  unitAmountOre: number;
  interval: Stripe.Price.Recurring.Interval;
  intervalCount?: number | null;
}) {
  const unitAmountOre = Math.round(Number(params.unitAmountOre) || 0);
  const intervalCount = Math.max(1, Number(params.intervalCount) || 1);

  if (params.interval === 'month') {
    return Math.round(unitAmountOre / intervalCount);
  }

  if (params.interval === 'year') {
    return Math.round(unitAmountOre / (12 * intervalCount));
  }

  return Math.round(unitAmountOre / intervalCount);
}
