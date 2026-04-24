'use client';

import { SchemaWarningBanner } from '@/components/admin/shared/SchemaWarningBanner';
import { PayrollHandoverList } from '@/components/admin/payroll/PayrollHandoverList';
import { PayrollHeader } from '@/components/admin/payroll/PayrollHeader';
import { PayrollMemberSection } from '@/components/admin/payroll/PayrollMemberSection';
import { PayrollTotalsStrip } from '@/components/admin/payroll/PayrollTotalsStrip';
import { usePayroll } from '@/hooks/admin/usePayroll';

export function PayrollScreen({ periodKey }: { periodKey: string | null }) {
  const { data, isLoading, error } = usePayroll(periodKey);

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

  return (
    <div className="space-y-6">
      <PayrollHeader
        period={data.period}
        availablePeriods={data.available_periods}
      />
      <SchemaWarningBanner warnings={data.schemaWarnings} />
      <PayrollTotalsStrip totals={data.totals} />
      <PayrollHandoverList scheduledChanges={data.scheduled_changes} />
      <div className="space-y-4">
        {data.rows.map((row) => (
          <PayrollMemberSection key={row.cm_id} row={row} />
        ))}
      </div>
    </div>
  );
}
