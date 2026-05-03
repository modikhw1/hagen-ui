'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Activity, AlertCircle, CheckCircle2, MinusCircle } from 'lucide-react';
import { apiClient } from '@/lib/admin/api-client';
import { cn } from '@/lib/utils';

interface SyncEvent {
  id: string;
  event_type: string;
  object_type: string | null;
  object_id: string | null;
  customer_profile_id: string | null;
  source: string;
  status: 'received' | 'applied' | 'skipped' | 'failed';
  received_at: string;
  error_message: string | null;
  environment: 'test' | 'live' | null;
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60_000);
  if (min < 1) return 'nyss';
  if (min < 60) return `${min} min`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} h`;
  const d = Math.floor(hr / 24);
  return `${d} d`;
}

function statusIcon(status: SyncEvent['status']) {
  if (status === 'applied')
    return <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />;
  if (status === 'failed')
    return <AlertCircle className="h-3.5 w-3.5 text-destructive" />;
  if (status === 'skipped')
    return <MinusCircle className="h-3.5 w-3.5 text-muted-foreground" />;
  return <Activity className="h-3.5 w-3.5 text-amber-500" />;
}

/**
 * Kompakt feed över de senaste Stripe-sync-eventsen system-brett.
 * Visas som widget i billing-cockpit.
 */
export function StripeSyncFeed({ limit = 10 }: { limit?: number }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['admin', 'billing', 'sync-events', 'global', limit],
    queryFn: async () =>
      apiClient.get<{ events: SyncEvent[] }>(
        '/api/admin/billing/sync-events',
        { query: { limit } },
      ),
    refetchInterval: 30_000,
    staleTime: 15_000,
  });

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <header className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground">
          Stripe-händelser
        </h2>
        <span className="text-xs text-muted-foreground">live</span>
      </header>

      {isLoading && (
        <p className="text-xs text-muted-foreground">Laddar…</p>
      )}

      {error && (
        <p className="text-xs text-destructive">
          Kunde inte ladda sync-events
        </p>
      )}

      {data && data.events.length === 0 && (
        <p className="text-xs text-muted-foreground">
          Inga händelser registrerade ännu.
        </p>
      )}

      {data && data.events.length > 0 && (
        <ul className="divide-y divide-border">
          {data.events.map((ev) => {
            const inner = (
              <div className="flex items-start gap-2 py-2">
                <span className="mt-0.5 shrink-0">{statusIcon(ev.status)}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium text-foreground">
                    {ev.event_type}
                  </p>
                  <p className="truncate text-[11px] text-muted-foreground">
                    {ev.source}
                    {ev.environment && (
                      <span
                        className={cn(
                          'ml-1.5 rounded px-1 py-px text-[10px] uppercase',
                          ev.environment === 'live'
                            ? 'bg-emerald-500/10 text-emerald-700'
                            : 'bg-amber-500/10 text-amber-700',
                        )}
                      >
                        {ev.environment}
                      </span>
                    )}
                    <span className="ml-1.5">· {timeAgo(ev.received_at)}</span>
                  </p>
                  {ev.error_message && (
                    <p className="mt-0.5 truncate text-[11px] text-destructive">
                      {ev.error_message}
                    </p>
                  )}
                </div>
              </div>
            );
            return (
              <li key={ev.id}>
                {ev.customer_profile_id ? (
                  <Link
                    href={`/admin/customers/${ev.customer_profile_id}/avtal`}
                    className="block rounded hover:bg-muted/40"
                  >
                    {inner}
                  </Link>
                ) : (
                  inner
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
