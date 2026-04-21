'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  XCircle,
} from 'lucide-react';
import { timeAgoSv } from '@/lib/admin/time';

type BillingHealthResponse = {
  environment: 'test' | 'live';
  schemaWarnings?: string[];
  stats: {
    mirroredInvoices: number;
    mirroredSubscriptions: number;
    failedSyncs: number;
    latestSuccessfulSyncAt: string | null;
  };
  recentSyncs?: Array<{
    id: string;
    event_type: string;
    object_type: string | null;
    object_id: string | null;
    status: string;
    error_message: string | null;
    created_at: string;
    environment: string | null;
  }>;
  recentFailures?: Array<{
    id: string;
    event_type: string;
    status: string;
    error_message: string | null;
    created_at: string;
  }>;
};

export default function HealthTab() {
  const queryClient = useQueryClient();
  const { data: health, isLoading } = useQuery({
    queryKey: ['admin', 'billing', 'health'],
    queryFn: async () => {
      const response = await fetch('/api/admin/billing-health', {
        credentials: 'include',
      });
      if (!response.ok) throw new Error('Kunde inte ladda billing health');
      return (await response.json()) as BillingHealthResponse;
    },
    staleTime: 60_000,
  });
  const retrySync = useMutation({
    mutationFn: async () => {
      const response = await fetch('/api/admin/billing-health/retry', {
        method: 'POST',
        credentials: 'include',
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error || 'Kunde inte kora om billing-sync');
      }
      return payload;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['admin', 'billing', 'health'] });
      await queryClient.invalidateQueries({ queryKey: ['admin', 'billing', 'invoices'] });
      await queryClient.invalidateQueries({ queryKey: ['admin', 'billing', 'subscriptions'] });
    },
  });

  const entries = health?.recentSyncs ?? [];
  const failures =
    health?.recentFailures ??
    entries.filter((entry) => entry.status === 'failed');

  return (
    <div className="space-y-4">
      {health?.schemaWarnings?.length ? (
        <div className="rounded-md border border-warning/30 bg-warning/5 px-3 py-2 text-sm text-warning">
          {health.schemaWarnings[0]}
        </div>
      ) : null}

      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">Miljo:</span>
        <span className="inline-flex rounded-full border border-border bg-secondary px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-foreground">
          {health?.environment?.toUpperCase() ?? '-'}
        </span>
        <button
          type="button"
          onClick={() => retrySync.mutate()}
          disabled={retrySync.isPending}
          className="ml-auto rounded-md border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-accent disabled:opacity-50"
        >
          {retrySync.isPending ? 'Kor om sync...' : 'Kor om billing-sync'}
        </button>
      </div>

      {retrySync.isError ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {retrySync.error instanceof Error ? retrySync.error.message : 'Retry misslyckades.'}
        </div>
      ) : null}

      {retrySync.isSuccess ? (
        <div className="rounded-md border border-success/30 bg-success/5 px-3 py-2 text-sm text-success">
          Billing-sync koordes om. Vyn uppdateras nar speglingen ar klar.
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <HealthCard
          label="Speglade fakturor"
          value={String(health?.stats.mirroredInvoices ?? 0)}
        />
        <HealthCard
          label="Speglade abonnemang"
          value={String(health?.stats.mirroredSubscriptions ?? 0)}
        />
        <HealthCard
          label="Misslyckade syncar"
          value={String(health?.stats.failedSyncs ?? 0)}
        />
        <HealthCard
          label="Senaste lyckade sync"
          value={timeAgoSv(health?.stats.latestSuccessfulSyncAt ?? null)}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <div className="overflow-hidden rounded-lg border border-border bg-card">
          <div className="border-b border-border px-5 py-4">
            <div className="text-base font-semibold text-foreground">
              Sync-logg
            </div>
            <div className="mt-1 text-sm text-muted-foreground">
              Senaste handelser fran Stripe-spegeln
            </div>
          </div>
          <div className="divide-y divide-border">
            {isLoading ? (
              <div className="px-5 py-8 text-sm text-muted-foreground">
                Laddar health...
              </div>
            ) : entries.length === 0 ? (
              <div className="px-5 py-8 text-sm text-muted-foreground">
                Inga sync-handelser hittades.
              </div>
            ) : (
              entries.slice(0, 20).map((entry) => {
                const Icon =
                  entry.status === 'success'
                    ? CheckCircle2
                    : entry.status === 'failed'
                      ? XCircle
                      : RefreshCw;
                const tone =
                  entry.status === 'success'
                    ? 'text-success'
                    : entry.status === 'failed'
                      ? 'text-destructive'
                      : 'text-warning';

                return (
                  <div
                    key={entry.id}
                    className="flex items-start gap-3 px-5 py-4"
                  >
                    <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${tone}`} />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium text-foreground">
                        {entry.event_type}
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {[entry.object_type, entry.object_id, entry.environment]
                          .filter(Boolean)
                          .join(' · ')}
                      </div>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {timeAgoSv(entry.created_at)}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        <div className="overflow-hidden rounded-lg border border-border bg-card">
          <div className="border-b border-border px-5 py-4">
            <div className="text-base font-semibold text-foreground">
              Senaste fel
            </div>
            <div className="mt-1 text-sm text-muted-foreground">
              Handelser som kraver uppfoljning
            </div>
          </div>
          <div className="divide-y divide-border">
            {isLoading ? (
              <div className="px-5 py-8 text-sm text-muted-foreground">
                Laddar fel...
              </div>
            ) : failures.length === 0 ? (
              <div className="px-5 py-8 text-sm text-muted-foreground">
                Inga registrerade fel just nu.
              </div>
            ) : (
              failures.slice(0, 10).map((entry) => (
                <div key={entry.id} className="px-5 py-4">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium text-foreground">
                        {entry.event_type}
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {timeAgoSv(entry.created_at)}
                      </div>
                      {entry.error_message ? (
                        <div className="mt-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
                          {entry.error_message}
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function HealthCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 text-xl font-bold text-foreground">{value}</div>
    </div>
  );
}
