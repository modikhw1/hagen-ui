'use client';

import { History } from 'lucide-react';
import EmptyState from '@/components/admin/EmptyState';
import { useCustomerActivity } from '@/hooks/admin/useCustomerDetail';
import { shortDateSv, timeAgoSv } from '@/lib/admin/time';
import { CustomerRouteError, CustomerRouteLoading, CustomerSection } from './shared';

export default function CustomerActivityRoute({ customerId }: { customerId: string }) {
  const { data, isLoading, error } = useCustomerActivity(customerId);

  if (isLoading) {
    return <CustomerRouteLoading label="Laddar aktivitet..." />;
  }

  if (error) {
    return <CustomerRouteError message={error.message} />;
  }

  return (
    <CustomerSection title="Aktivitetslogg">
      <div className="space-y-3">
        {data?.schemaWarnings?.length ? (
          <div className="rounded-md border border-warning/30 bg-warning/5 px-3 py-2 text-xs text-warning">
            {data.schemaWarnings[0]}
          </div>
        ) : null}

        {data?.activities?.length ? (
          data.activities.map((entry) => (
            <div
              key={entry.id}
              className="rounded-md border border-border bg-secondary/20 px-4 py-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm font-semibold text-foreground">{entry.title}</div>
                <div className="text-[11px] text-muted-foreground">{timeAgoSv(entry.at)}</div>
              </div>
              <div className="mt-1 text-sm text-muted-foreground">{entry.description}</div>
              <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
                <span className="rounded-full bg-background px-2 py-1">{entry.kind}</span>
                <span>{entry.actorLabel || 'System'}</span>
                <span>{shortDateSv(entry.at)}</span>
              </div>
            </div>
          ))
        ) : (
          <EmptyState
            icon={History}
            title="Ingen historik hittades an"
            hint="Auditlogg och kundaktivitet visas har nar det finns data."
          />
        )}
      </div>
    </CustomerSection>
  );
}
