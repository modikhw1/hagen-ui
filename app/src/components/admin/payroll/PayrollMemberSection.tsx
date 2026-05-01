'use client';

import { ChevronDown, ChevronUp, Download } from 'lucide-react';
import { useMemo, useState } from 'react';
import { StatBlock } from '@/components/admin/shared/StatBlock';
import { Button, Card, Text, Group, Stack } from '@mantine/core';
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
    <Card withBorder padding="lg" radius="md">
      <Stack gap="md">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <Text fw={600} size="md">{row.cm_name}</Text>
            <Text size="xs" c="dimmed">{row.cm_email || 'Ingen e-post'}</Text>
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

        <Group gap="xs">
          <Button variant="outline" size="sm" onClick={() => onToggle(row.cm_id)} leftSection={expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}>
            {expanded ? 'Dölj kundunderlag' : 'Visa kundunderlag'}
          </Button>
          <Button
            component="a"
            href={exportHref}
            variant="ghost"
            size="sm"
            leftSection={<Download className="h-4 w-4" />}
          >
            Exportera CM
          </Button>
        </Group>

        {expanded ? (
          <div className="pt-2">
            <PayrollCustomerRows
              customers={customers}
              sort={sort}
              onSortChange={setSort}
              isLoading={breakdownQuery.isLoading && !breakdownQuery.data}
            />
          </div>
        ) : null}
      </Stack>
    </Card>
  );
}
