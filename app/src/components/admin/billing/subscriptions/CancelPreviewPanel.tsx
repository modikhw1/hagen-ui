'use client';

import { useState } from 'react';
import { Loader2, RefreshCw } from 'lucide-react';
import { shortDateSv } from '@/lib/admin/time';

type CancellationMode = 'end_of_period' | 'immediate' | 'immediate_with_credit';

export interface CancelPreview {
  mode: CancellationMode;
  current_period_start: string | null;
  current_period_end: string | null;
  effective_date: string;
  days_remaining: number;
  unused_amount_ore: number;
  proposed_credit_ore: number;
}

export interface CancelPreviewPanelProps {
  customerId: string;
  mode: CancellationMode;
}

function fmtKr(amountOre: number): string {
  return `${Math.round(amountOre / 100).toLocaleString('sv-SE')} kr`;
}

/**
 * Förhandsgranskning av avslut: oanvända dagar, prorata-belopp och
 * föreslagen kreditering. Ingen submit-knapp – den finns kvar i
 * SubscriptionActions där bekräftelsen sker.
 */
export function CancelPreviewPanel({ customerId, mode }: CancelPreviewPanelProps) {
  const [data, setData] = useState<CancelPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/admin/customers/${customerId}/subscription/cancel-preview`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mode }),
        },
      );
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(payload.error ?? `HTTP ${res.status}`);
      }
      setData(payload.preview ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Kunde inte ladda preview');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-md border border-border bg-muted/30 p-3 text-xs">
      <div className="mb-2 flex items-center justify-between">
        <span className="font-medium text-foreground">Förhandsgranska effekt</span>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="inline-flex items-center gap-1 rounded border border-border bg-background px-2 py-1 text-xs hover:bg-muted disabled:opacity-50"
        >
          {loading ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <RefreshCw className="h-3 w-3" />
          )}
          {data ? 'Uppdatera' : 'Räkna ut'}
        </button>
      </div>

      {error && <p className="text-destructive">{error}</p>}

      {data && (
        <dl className="grid grid-cols-2 gap-y-1.5 text-xs">
          <dt className="text-muted-foreground">Slutar gälla</dt>
          <dd className="font-medium text-foreground">
            {shortDateSv(data.effective_date)}
          </dd>

          <dt className="text-muted-foreground">Dagar kvar i perioden</dt>
          <dd className="font-medium text-foreground">{data.days_remaining}</dd>

          <dt className="text-muted-foreground">Oanvänt belopp (prorata)</dt>
          <dd className="font-medium text-foreground tabular-nums">
            {fmtKr(data.unused_amount_ore)}
          </dd>

          {mode === 'immediate_with_credit' && (
            <>
              <dt className="text-muted-foreground">Föreslagen kreditering</dt>
              <dd className="font-semibold text-emerald-700 tabular-nums">
                {fmtKr(data.proposed_credit_ore)}
              </dd>
            </>
          )}
        </dl>
      )}

      {!data && !loading && !error && (
        <p className="text-muted-foreground">
          Klicka <em>Räkna ut</em> för att se prorata-belopp innan du bekräftar.
        </p>
      )}
    </div>
  );
}