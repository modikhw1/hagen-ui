export type RecurringInterval = 'month' | 'year' | 'week' | 'day';

export interface RecurringUnitAmount {
  unitAmountOre: number;
  interval: RecurringInterval;
  intervalCount: number;
}

export function monthlyAmountOreFromRecurringUnit({
  unitAmountOre,
  interval,
  intervalCount,
}: RecurringUnitAmount): number {
  const count = Math.max(1, intervalCount);
  if (interval === 'month') return Math.round(unitAmountOre / count);
  if (interval === 'year') return Math.round(unitAmountOre / (count * 12));
  if (interval === 'week') return Math.round((unitAmountOre * 52) / (count * 12));
  if (interval === 'day') return Math.round((unitAmountOre * 365) / (count * 12));
  return Math.round(unitAmountOre / count);
}

export function recurringUnitAmountFromMonthlySek(monthlySek: number): number {
  return Math.round(monthlySek * 100);
}
