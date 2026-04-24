'use client';

import { StatBlock } from '@/components/admin/shared/StatBlock';
import { formatSek } from '@/lib/admin/money';
import type { PayrollResponse } from '@/lib/admin/schemas/payroll';

type Props = {
  totals: PayrollResponse['totals'];
};

export function PayrollTotalsStrip({ totals }: Props) {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
      <StatBlock label="Aktiva CMs" value={String(totals.cm_count)} />
      <StatBlock label="Aktiva kunder" value={String(totals.active_customers)} />
      <StatBlock label="Billat underlag" value={formatSek(totals.billed_ore)} />
      <StatBlock label="Beraknad payout" value={formatSek(totals.payout_ore)} />
      <StatBlock label="Billbara dagar" value={String(totals.billable_days)} />
    </div>
  );
}
