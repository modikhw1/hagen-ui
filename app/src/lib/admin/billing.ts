import { oreToSek } from '@/lib/admin/money';
import { monthlyAmountOreFromRecurringUnit } from '@/lib/stripe/price-amounts';

export type BillingTab = 'invoices' | 'subscriptions' | 'health';
export type EnvFilter = 'all' | 'test' | 'live';
export type ConcreteBillingEnv = Exclude<EnvFilter, 'all'>;

export const billingInvoiceStatuses = ['all', 'open', 'paid', 'partially_refunded'] as const;
export type BillingInvoiceStatusFilter = (typeof billingInvoiceStatuses)[number];

export const billingSubscriptionStatuses = [
  'all',
  'active',
  'paused',
  'canceled',
  'expiring',
] as const;
export type BillingSubscriptionStatusFilter = (typeof billingSubscriptionStatuses)[number];

type SubscriptionBillingAmount = {
  amount: number;
  interval: string | null;
  interval_count: number | null | undefined;
};

export function isEnvFilter(value: string | null | undefined): value is EnvFilter {
  return value === 'all' || value === 'test' || value === 'live';
}

export function envFilterLabel(env: EnvFilter) {
  if (env === 'all') return 'Alla miljöer';
  return env.toUpperCase();
}

export function resolveConcreteBillingEnv(
  env: EnvFilter,
  fallback: ConcreteBillingEnv,
): ConcreteBillingEnv {
  return env === 'all' ? fallback : env;
}

function normalizedMonthlyOre(subscription: SubscriptionBillingAmount) {
  const amountOre = Math.round(Number(subscription.amount) || 0);
  const interval = subscription.interval ?? 'month';
  const intervalCount = Math.max(1, Number(subscription.interval_count) || 1);

  if (interval === 'quarter') {
    return monthlyAmountOreFromRecurringUnit({
      unitAmountOre: amountOre,
      interval: 'month',
      intervalCount: 3,
    });
  }

  if (interval === 'month' || interval === 'year') {
    return monthlyAmountOreFromRecurringUnit({
      unitAmountOre: amountOre,
      interval,
      intervalCount,
    });
  }

  if (interval === 'week') {
    return Math.round((amountOre * 52) / (12 * intervalCount));
  }

  return Math.round(amountOre / intervalCount);
}

export function subscriptionMonthlyPriceSek(subscription: SubscriptionBillingAmount) {
  return oreToSek(normalizedMonthlyOre(subscription));
}

export function buildBillingIdempotencyKey(params: {
  adminId: string;
  action: string;
  targetId: string;
  date?: Date;
  precision?: 'day' | 'hour';
}) {
  const date = params.date ?? new Date();
  const iso = date.toISOString();
  const bucket =
    params.precision === 'hour'
      ? iso.slice(0, 13).replace('T', '-')
      : iso.slice(0, 10);

  return `${params.action}:${params.adminId}:${params.targetId}:${bucket}`;
}

export function parseMonthlyPriceSekInput(raw: string) {
  const normalized = raw.trim().replace(',', '.');
  if (!normalized) {
    return null;
  }

  if (!/^\d+$/.test(normalized)) {
    return Number.NaN;
  }

  const parsed = Number(normalized);
  return Number.isSafeInteger(parsed) ? parsed : Number.NaN;
}
