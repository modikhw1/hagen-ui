'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/admin/api-client';
import { type EnvFilter } from '@/lib/admin/billing';
import { timeAgoSv } from '@/lib/admin/time';

type DriftItem = {
  kind: 'invoice' | 'subscription';
  stripeId: string;
  reason: 'missing_in_mirror' | 'status_mismatch' | 'amount_mismatch';
  detail: string;
  stripeStatus?: string | null;
  mirrorStatus?: string | null;
  customerId?: string | null;
};

type DriftResponse = {
  environment: string;
  windowHours: number;
  scannedAt: string;
  scanned: { invoices: number; subscriptions: number };
  driftCount: number;
  drift: DriftItem[];
};

const reasonLabel: Record<DriftItem['reason'], string> = {
  missing_in_mirror: 'Saknas i mirror',
  status_mismatch: 'Status skiljer',
  amount_mismatch: 'Belopp skiljer',
};

export default function DriftBanner({ env }: { env: EnvFilter }) {
  const [expanded, setExpanded] = useState(false);
  const concreteEnv = env === 'all' ? 'live' : env;

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['billing', 'drift', concreteEnv],
    queryFn: ({ signal }) =>
      apiClient.get<DriftResponse>('/api/admin/billing/drift', {
        signal,
        query: { env: concreteEnv, hours: 24 },
      }),
    staleTime: 60_000,
    retry: false,
  });

  if (isLoading) {
    return (
      <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
        Söker drift mot Stripe...
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-md border border-status-warning-fg/30 bg-status-warning-bg px-3 py-2 text-xs text-status-warning-fg">
        Kunde inte ladda drift-status: {(error as Error).message}
      </div>
    );
  }

  if (!data) return null;

  if (data.driftCount === 0) {
    return (
      <div className="flex items-center justify-between rounded-md border border-status-success-fg/30 bg-status-success-bg px-3 py-2 text-xs text-status-success-fg">
        <span>
          Ingen drift upptäckt ({data.scanned.invoices} fakturor + {data.scanned.subscriptions}{' '}
          abonnemang skannade, senaste {data.windowHours} h)
        </span>
        <button
          type="button"
          onClick={() => void refetch()}
          disabled={isFetching}
          className="text-xs underline disabled:opacity-50"
        >
          {isFetching ? 'Skannar...' : 'Skanna igen'}
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-md border border-status-danger-fg/30 bg-status-danger-bg p-3 text-status-danger-fg">
      <div className="flex items-center justify-between">
        <div className="text-sm font-medium">
          {data.driftCount} avvikelse{data.driftCount === 1 ? '' : 'r'} mellan Stripe och mirror
          <span className="ml-2 text-xs opacity-80">
            (senaste {data.windowHours} h, skannad {timeAgoSv(data.scannedAt)})
          </span>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setExpanded((value) => !value)}
            className="text-xs underline"
          >
            {expanded ? 'Dölj' : 'Visa detaljer'}
          </button>
          <button
            type="button"
            onClick={() => void refetch()}
            disabled={isFetching}
            className="text-xs underline disabled:opacity-50"
          >
            {isFetching ? 'Skannar...' : 'Skanna igen'}
          </button>
        </div>
      </div>

      {expanded ? (
        <ul className="mt-3 max-h-64 space-y-1.5 overflow-auto">
          {data.drift.map((item) => (
            <li
              key={`${item.kind}-${item.stripeId}-${item.reason}`}
              className="flex items-start justify-between gap-3 rounded border border-status-danger-fg/20 bg-card/60 px-2.5 py-1.5 text-xs text-foreground"
            >
              <div className="min-w-0 flex-1">
                <div className="font-mono text-[11px]">{item.stripeId}</div>
                <div className="text-muted-foreground">{item.detail}</div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase text-muted-foreground">
                  {item.kind}
                </span>
                <span className="rounded bg-status-danger-bg px-1.5 py-0.5 text-[10px] text-status-danger-fg">
                  {reasonLabel[item.reason]}
                </span>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
