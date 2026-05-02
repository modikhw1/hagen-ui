'use client';

import AttentionList from '@/components/admin/AttentionList';
import { useNotifications } from '@/hooks/admin/useNotifications';
import { PageHeader } from '@/components/admin/ui/layout/PageHeader';

export default function NotificationsPage() {
  const { data, isLoading, error } = useNotifications();

  if (isLoading) {
    return <div className="py-12 text-sm text-muted-foreground">Laddar notifikationer...</div>;
  }

  if (error || !data) {
    return (
      <div className="rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
        Kunde inte ladda notifikationer.
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <PageHeader
        title="Notifikationer"
        subtitle="Samlad operativ inkorg för onboarding, fakturor, blockeringar och demosvar."
      />

      <section className="rounded-lg border border-border bg-card p-5">
        <div className="mb-3 flex items-baseline justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-foreground">Öppna ärenden</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Sorterade enligt operativ prioritet.
            </p>
          </div>
          <span className="rounded-full bg-secondary px-2.5 py-1 text-[11px] font-semibold text-muted-foreground">
            {data.totalCount} öppna
          </span>
        </div>
        <AttentionList
          items={data.items}
          lastSeenAt={data.lastSeenAt ?? null}
          trackSeen
          surface="notifications"
        />
      </section>

      <section className="rounded-lg border border-border bg-card p-5">
        <div className="mb-3 flex items-baseline justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-foreground">Hanteras nu</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Snoozade ärenden som fortfarande ska kunna följas upp.
            </p>
          </div>
          <span className="rounded-full bg-secondary px-2.5 py-1 text-[11px] font-semibold text-muted-foreground">
            {data.snoozedCount} markerade
          </span>
        </div>
        <AttentionList
          items={data.snoozedItems}
          mode="snoozed"
          emptyLabel="Inga notifikationer är markerade som hanteras just nu."
        />
      </section>
    </div>
  );
}
