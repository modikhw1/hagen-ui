'use client';

import { useState } from 'react';
import { History, Filter } from 'lucide-react';
import EmptyState from '@/components/admin/EmptyState';
import { useCustomerActivity } from '@/hooks/admin/useCustomerActivity';
import { shortDateSv, timeAgoSv } from '@/lib/admin/time';
import { OPERATOR_COPY } from '@/lib/admin/copy/operator-glossary';
import { CustomerRouteError, CustomerRouteLoading, CustomerSection } from './shared';
import { cn } from '@/lib/utils';

export default function CustomerActivityRoute({ customerId }: { customerId: string }) {
  const { data, isLoading, error } = useCustomerActivity(customerId);
  const [onlyCm, setOnlyCm] = useState(false);

  if (isLoading) {
    return <CustomerRouteLoading label="Laddar aktivitet..." />;
  }

  if (error) {
    return <CustomerRouteError message={error.message} />;
  }

  const activities = data?.activities ?? [];
  const filteredActivities = activities.filter((entry) => {
    if (!onlyCm) return true;
    return (
      entry.kind === 'cm_activity' ||
      entry.actorRole === 'content_manager' ||
      entry.actorRole === 'cm'
    );
  });

  return (
    <CustomerSection 
      title="Aktivitetslogg"
      action={
        <button
          onClick={() => setOnlyCm(!onlyCm)}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors",
            onlyCm 
              ? "border-primary bg-primary/10 text-primary" 
              : "border-border bg-background text-muted-foreground hover:bg-accent hover:text-foreground"
          )}
        >
          <Filter className="h-3.5 w-3.5" />
          Endast CM
        </button>
      }
    >
      <div className="space-y-3">
        {data?.schemaWarnings?.length ? (
          <div className="rounded-md border border-status-warning-fg/30 bg-status-warning-bg px-3 py-2 text-xs text-status-warning-fg">
            {data.schemaWarnings[0]}
          </div>
        ) : null}

        {filteredActivities.length ? (
          filteredActivities.map((entry) => (
            <div
              key={entry.id}
              className="rounded-md border border-border bg-secondary/20 px-4 py-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <div className="text-sm font-semibold text-foreground">{entry.title}</div>
                  {entry.entityType && (OPERATOR_COPY.attention as any)[entry.entityType] && (
                    <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary uppercase">
                      {(OPERATOR_COPY.attention as any)[entry.entityType]}
                    </span>
                  )}
                </div>
                <div className="text-[11px] text-muted-foreground">{timeAgoSv(entry.at)}</div>
              </div>
              <div className="mt-1 text-sm text-muted-foreground">{entry.description}</div>
              <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
                <span className="rounded-full bg-background px-2 py-1 uppercase tracking-tight">{entry.kind.replace('_', ' ')}</span>
                <span className="font-medium text-foreground">{entry.actorLabel || 'System'}</span>
                <span>{shortDateSv(entry.at)}</span>
              </div>
            </div>
          ))
        ) : (
          <EmptyState
            icon={History}
            title={onlyCm ? "Inga CM-aktiviteter hittades" : "Ingen historik hittades än"}
            hint="Auditlogg och kundaktivitet visas här när det finns data."
          />
        )}
      </div>
    </CustomerSection>
  );
}
