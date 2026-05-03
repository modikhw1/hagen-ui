'use client';

import { StatBlock } from '@/components/admin/shared/StatBlock';
import { formatSek } from '@/lib/admin/money';
import type { PayrollResponse } from '@/lib/admin/schemas/payroll';

type Props = {
  totals: PayrollResponse['totals'];
};

type TrendMeta = {
  delta: number;
  trend: 'up' | 'down' | 'flat';
};

function resolveTrend(current: number, previous: number | undefined): TrendMeta | undefined {
  if (previous === undefined || previous === 0) {
    return undefined;
  }

  const diff = ((current - previous) / Math.abs(previous)) * 100;
  const rounded = Math.round(diff * 10) / 10;

  if (rounded > 0) {
    return { delta: rounded, trend: 'up' };
  }
  if (rounded < 0) {
    return { delta: rounded, trend: 'down' };
  }

  return { delta: 0, trend: 'flat' };
}

export function PayrollTotalsStrip({ totals }: Props) {
  const payoutTrend = resolveTrend(totals.payout_ore, totals.previous?.payout_ore);
  const billedTrend = resolveTrend(totals.billed_ore, totals.previous?.billed_ore);
  const dayTrend = resolveTrend(totals.billable_days, totals.previous?.billable_days);

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
      <StatBlock
        label="Beräknad payout"
        value={formatSek(totals.payout_ore)}
        delta={payoutTrend?.delta}
        trend={payoutTrend?.trend}
      />
      <StatBlock
        label="Billat underlag"
        value={formatSek(totals.billed_ore)}
        delta={billedTrend?.delta}
        trend={billedTrend?.trend}
      />
      <StatBlock label="Aktiva CMs" value={String(totals.cm_count)} />
      <StatBlock label="Aktiva kunder" value={String(totals.active_customers)} />
      <StatBlock
        label="Billbara dagar"
        value={String(totals.billable_days)}
        delta={dayTrend?.delta}
        trend={dayTrend?.trend}
      />
    </div>
  );
}
