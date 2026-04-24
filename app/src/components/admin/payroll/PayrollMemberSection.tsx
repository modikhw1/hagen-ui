'use client';

import { ChevronDown, ChevronUp, Download } from 'lucide-react';
import { useMemo, useState } from 'react';
import { StatBlock } from '@/components/admin/shared/StatBlock';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { usePayrollBreakdown } from '@/hooks/admin/usePayrollBreakdown';
import { formatSek } from '@/lib/admin/money';
import type { PayrollResponse } from '@/lib/admin/schemas/payroll';
import { PayrollCustomerRows } from './PayrollCustomerRows';
import { StatusPill } from '@/components/admin/ui/StatusPill';
import type { OperatorTone } from '@/lib/admin/copy/operator-glossary';

type SortState = { key: 'billed_ore' | 'payout_ore' | 'billable_days'; direction: 'asc' | 'desc' };

type Props = {
  periodKey: string;
  row: PayrollResponse['rows'][number];
  expanded: boolean;
  onToggle: (cmId: string) => void;
};

function deriveLoadTone(customerCount: number): { label: string; tone: OperatorTone } {
  if (customerCount >= 11) {
    return {
      label: 'Överbelastad',
      tone: 'danger',
    };
  }

  if (customerCount >= 8) {
    return {
      label: 'Hög belastning',
      tone: 'warning',
    };
  }

  return {
    label: 'Stabil nivå',
    tone: 'neutral',
  };
}

export function PayrollMemberSection({ periodKey, row, expanded, onToggle }: Props) {
  const [sort, setSort] = useState<SortState>({ key: 'billed_ore', direction: 'desc' });
  const breakdownQuery = usePayrollBreakdown({
    periodKey,
    cmId: row.cm_id,
    enabled: expanded,
  });

  const customers = useMemo(() => {
    const source = breakdownQuery.data?.customers ?? row.customer_breakdown;
    return [...source].sort((left, right) => {
      const leftValue = left[sort.key];
      const rightValue = right[sort.key];
      if (sort.direction === 'asc') {
        return leftValue - rightValue;
      }
      return rightValue - leftValue;
    });
  }, [breakdownQuery.data?.customers, row.customer_breakdown, sort]);

  const exportHref = `/api/admin/payroll/export?${new URLSearchParams({
    period: periodKey,
    cmId: row.cm_id,
  }).toString()}`;
  const loadTone = deriveLoadTone(row.assigned_customers);

  return (
    <Card>
      <CardHeader className="gap-4 p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="text-base font-semibold text-foreground">{row.cm_name}</div>
            <div className="text-xs text-muted-foreground">{row.cm_email || 'Ingen e-post'}</div>
            <StatusPill
              label={loadTone.label}
              tone={loadTone.tone}
              className="mt-2"
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-4">
            <StatBlock label="Kommission" value={`${Math.round(row.commission_rate * 100)}%`} compact />
            <StatBlock label="Billat" value={formatSek(row.billed_ore)} compact />
            <StatBlock label="Payout" value={formatSek(row.payout_ore)} compact />
            <StatBlock label="Dagar" value={String(row.billable_days)} compact />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => onToggle(row.cm_id)}>
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            {expanded ? 'Dölj kundunderlag' : 'Visa kundunderlag'}
          </Button>
          <a
            href={exportHref}
            className={buttonVariants({ variant: 'ghost', size: 'sm' })}
          >
            <Download className="h-4 w-4" />
            Exportera CM
          </a>
        </div>
      </CardHeader>

      {expanded ? (
        <CardContent className="px-5 pb-5 pt-0">
          <PayrollCustomerRows
            customers={customers}
            sort={sort}
            onSortChange={setSort}
            isLoading={breakdownQuery.isLoading && !breakdownQuery.data}
          />
        </CardContent>
      ) : null}
    </Card>
  );
}
