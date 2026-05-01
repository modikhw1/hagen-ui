'use client';

import { useMemo } from 'react';
import { PayrollHandoverList } from '@/components/admin/payroll/PayrollHandoverList';
import { PayrollHeader } from '@/components/admin/payroll/PayrollHeader';
import { PayrollMemberSection } from '@/components/admin/payroll/PayrollMemberSection';
import { PayrollTotalsStrip } from '@/components/admin/payroll/PayrollTotalsStrip';
import { SchemaWarningBanner } from '@/components/admin/shared/SchemaWarningBanner';
import { usePayroll } from '@/hooks/admin/usePayroll';
import { useUrlState } from '@/hooks/useUrlState';

function parseExpanded(value: string | null) {
  if (!value) {
    return [] as string[];
  }

  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

export function PayrollScreen({ periodKey }: { periodKey: string | null }) {
  const { data, isLoading, error } = usePayroll(periodKey);
  const { get, set } = useUrlState();
  const expandedIds = useMemo(() => parseExpanded(get('expand')), [get]);

  if (isLoading) {
    return <div className="py-12 text-sm text-muted-foreground">Laddar payroll...</div>;
  }

  if (error || !data) {
    return (
      <div className="rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
        {error instanceof Error ? error.message : 'Kunde inte ladda payroll.'}
      </div>
    );
  }

  const expandedSet = new Set(expandedIds);

  return (
    <div className="space-y-6">
      <PayrollHeader period={data.period} availablePeriods={data.available_periods} />
      <SchemaWarningBanner warnings={data.schemaWarnings} />
      <PayrollTotalsStrip totals={data.totals} />
      <PayrollHandoverList
        periodKey={data.period.key}
        scheduledChanges={data.scheduled_changes}
      />
      <div className="space-y-4">
        {data.rows.map((row) => (
          <PayrollMemberSection
            key={row.cm_id}
            periodKey={data.period.key}
            row={row}
            expanded={expandedSet.has(row.cm_id)}
            onToggle={(cmId) => {
              const next = new Set(expandedSet);
              if (next.has(cmId)) {
                next.delete(cmId);
              } else {
                next.add(cmId);
              }

              const serialized = Array.from(next);
              set({ expand: serialized.length > 0 ? serialized.join(',') : null });
            }}
          />
        ))}
      </div>
    </div>
  );
}
