'use client';

import type { PayrollResponse } from '@/lib/admin/schemas/payroll';

type Props = {
  scheduledChanges: PayrollResponse['scheduled_changes'];
};

export function PayrollHandoverList({ scheduledChanges }: Props) {
  return (
    <section className="rounded-lg border border-border bg-card p-5">
      <div className="mb-3">
        <h2 className="text-sm font-semibold text-foreground">Schemalagda handovers</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Kommande CM-byten som kommer att trada i kraft automatiskt via cron-jobbet.
        </p>
      </div>
      <div className="space-y-2">
        {scheduledChanges.length === 0 ? (
          <div className="rounded-md border border-border bg-secondary/20 px-3 py-3 text-sm text-muted-foreground">
            Inga schemalagda CM-byten hittades.
          </div>
        ) : (
          scheduledChanges.map((change) => (
            <div
              key={`${change.customer_id}-${change.effective_date}`}
              className="rounded-md border border-border bg-secondary/20 px-3 py-3 text-sm"
            >
              <div className="font-medium text-foreground">
                {change.customer_name} Â· {change.current_cm_name || 'Ingen CM'} {'->'}{' '}
                {change.next_cm_name || 'Ingen CM'}
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                Aktivt fran {change.effective_date}
                {change.handover_note ? ` Â· ${change.handover_note}` : ''}
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
