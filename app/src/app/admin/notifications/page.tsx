'use client';

import { useMemo } from 'react';
import AttentionList from '@/components/admin/AttentionList';
import { useOverviewData } from '@/hooks/admin/useOverviewData';
import { deriveOverview } from '@/lib/admin/overview-derive';

export default function NotificationsPage() {
  const { data, isLoading, error } = useOverviewData();
  const derived = useMemo(() => (data ? deriveOverview(data) : null), [data]);

  if (isLoading) {
    return <div className="py-12 text-sm text-muted-foreground">Laddar notifications...</div>;
  }

  if (error || !derived) {
    return (
      <div className="rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
        Kunde inte ladda notifications.
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-heading text-2xl font-bold text-foreground">Notifications</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Samlad operativ inkorg for onboarding, fakturor, blockeringar och demosvar.
        </p>
      </div>

      <section className="rounded-lg border border-border bg-card p-5">
        <div className="mb-3 flex items-baseline justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-foreground">Oppna arenden</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Sorterade enligt operativ prioritet.
            </p>
          </div>
          <span className="rounded-full bg-secondary px-2.5 py-1 text-[11px] font-semibold text-muted-foreground">
            {derived.attentionItems.length} oppna
          </span>
        </div>
        <AttentionList
          items={derived.attentionItems}
          lastSeenAt={data?.attentionFeedSeenAt ?? null}
          trackSeen
          surface="notifications"
        />
      </section>

      <section className="rounded-lg border border-border bg-card p-5">
        <div className="mb-3 flex items-baseline justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-foreground">Hanteras nu</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Snoozade arenden som fortfarande ska kunna foljas upp.
            </p>
          </div>
          <span className="rounded-full bg-secondary px-2.5 py-1 text-[11px] font-semibold text-muted-foreground">
            {derived.snoozedAttentionItems.length} markerade
          </span>
        </div>
        <AttentionList
          items={derived.snoozedAttentionItems}
          mode="snoozed"
          emptyLabel="Inga notifications ar markerade som hanteras just nu."
        />
      </section>
    </div>
  );
}
