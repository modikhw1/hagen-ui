import { subDays } from 'date-fns';

export type MetricCard = {
  label: string;
  value: string;
  delta?: { text: string; tone: 'success' | 'muted' | 'destructive' };
  sub?: string;
  trend?: number[];
};

export type OverviewInput = {
  activeSubscriptions: { mrr_ore: number; created_at: Date; canceled_at: Date | null }[];
  customers: { id: string; status: 'active' | 'paused' | 'churned'; activated_at: Date | null; churned_at: Date | null }[];
  demos: { id: string; status: 'draft' | 'sent' | 'opened' | 'responded' | 'won' | 'lost' | 'expired'; status_changed_at: Date; resolved_at: Date | null }[];
  costs30d_ore: number;
  now: Date;
};

const SEK = (ore: number) => `${Math.round(ore / 100).toLocaleString('sv-SE')} kr`;

export function monthlyRevenueCard(input: OverviewInput): MetricCard {
  const cutoff = subDays(input.now, 30);
  const mrrNow = input.activeSubscriptions
    .filter((subscription) => !subscription.canceled_at || subscription.canceled_at > input.now)
    .reduce((sum, subscription) => sum + subscription.mrr_ore, 0);
  const mrr30dAgo = input.activeSubscriptions
    .filter((subscription) => subscription.created_at <= cutoff && (!subscription.canceled_at || subscription.canceled_at > cutoff))
    .reduce((sum, subscription) => sum + subscription.mrr_ore, 0);
  const delta = mrrNow - mrr30dAgo;

  return {
    label: 'Månatliga intäkter',
    value: SEK(mrrNow),
    delta: {
      text: `${delta >= 0 ? '+' : ''}${SEK(delta)}`,
      tone: delta > 0 ? 'success' : delta < 0 ? 'destructive' : 'muted',
    },
    sub: '30d',
  };
}

export function activeCustomersCard(input: OverviewInput): MetricCard {
  const cutoff = subDays(input.now, 30);
  const active = input.customers.filter((customer) => customer.status === 'active').length;
  const newWithin = input.customers.filter((customer) => customer.activated_at && customer.activated_at >= cutoff).length;
  const churnedWithin = input.customers.filter((customer) => customer.churned_at && customer.churned_at >= cutoff).length;
  const net = newWithin - churnedWithin;

  return {
    label: 'Aktiva kunder',
    value: String(active),
    delta: net !== 0
      ? {
          text: `(${net > 0 ? '+' : ''}${net})`,
          tone: net > 0 ? 'success' : 'destructive',
        }
      : undefined,
    sub: '30d',
  };
}

export function demosCard(input: OverviewInput): MetricCard {
  const cutoff = subDays(input.now, 30);
  const sent = input.demos.filter((demo) =>
    ['sent', 'opened', 'responded', 'won', 'lost'].includes(demo.status) && demo.status_changed_at >= cutoff,
  ).length;
  const won = input.demos.filter((demo) => demo.status === 'won' && demo.resolved_at && demo.resolved_at >= cutoff).length;

  return {
    label: 'Demos skickade',
    value: String(sent),
    sub: `${won} konverterade`,
  };
}

export function costsCard(input: OverviewInput): MetricCard {
  return {
    label: 'Kostnad 30d',
    value: SEK(input.costs30d_ore),
    sub: '30d',
  };
}
