'use client';

import { StatBlock } from '@/components/admin/shared/StatBlock';
import { formatSek } from '@/lib/admin/money';
import type { PayrollResponse } from '@/lib/admin/schemas/payroll';
import { PayrollCustomerRows } from './PayrollCustomerRows';

type Props = {
  row: PayrollResponse['rows'][number];
};

export function PayrollMemberSection({ row }: Props) {
  return (
    <section className="rounded-lg border border-border bg-card p-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="text-base font-semibold text-foreground">{row.cm_name}</div>
          <div className="text-xs text-muted-foreground">
            {row.cm_email || 'Ingen e-post'}
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-4">
          <StatBlock
            label="Kommission"
            value={`${Math.round(row.commission_rate * 100)}%`}
            compact
          />
          <StatBlock label="Billat" value={formatSek(row.billed_ore)} compact />
          <StatBlock label="Payout" value={formatSek(row.payout_ore)} compact />
          <StatBlock label="Dagar" value={String(row.billable_days)} compact />
        </div>
      </div>

      <PayrollCustomerRows cmId={row.cm_id} customers={row.customer_breakdown} />
    </section>
  );
}
