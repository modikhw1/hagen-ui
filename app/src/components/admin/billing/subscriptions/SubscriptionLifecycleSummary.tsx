'use client';

import { Pause, Play, AlertTriangle, Calendar, RefreshCw } from 'lucide-react';
import { shortDateSv } from '@/lib/admin/time';
import { cn } from '@/lib/utils';

export interface SubscriptionLifecycleSummaryProps {
  status: string;
  cancelAtPeriodEnd?: boolean;
  currentPeriodStart?: string | null;
  currentPeriodEnd?: string | null;
  pausedUntil?: string | null;
  monthlyPriceOre?: number | null;
  currency?: string;
}

function daysBetween(fromIso: string | null | undefined, toIso: string | null | undefined): number | null {
  if (!fromIso || !toIso) return null;
  const from = new Date(fromIso).getTime();
  const to = new Date(toIso).getTime();
  if (!Number.isFinite(from) || !Number.isFinite(to)) return null;
  return Math.max(0, Math.ceil((to - from) / 86_400_000));
}

function progressPct(start: string | null | undefined, end: string | null | undefined): number {
  if (!start || !end) return 0;
  const s = new Date(start).getTime();
  const e = new Date(end).getTime();
  const now = Date.now();
  if (!Number.isFinite(s) || !Number.isFinite(e) || e <= s) return 0;
  const pct = ((now - s) / (e - s)) * 100;
  return Math.max(0, Math.min(100, pct));
}

function fmtKr(amountOre: number | null | undefined): string {
  if (amountOre == null) return '—';
  return `${Math.round(amountOre / 100).toLocaleString('sv-SE')} kr`;
}

/**
 * Visuell översikt över ett abonnemangs livscykel: status, period-progress,
 * nästa händelse. Endast presentation – ingen logik.
 */
export function SubscriptionLifecycleSummary({
  status,
  cancelAtPeriodEnd = false,
  currentPeriodStart,
  currentPeriodEnd,
  pausedUntil,
  monthlyPriceOre,
}: SubscriptionLifecycleSummaryProps) {
  const daysLeft = daysBetween(new Date().toISOString(), currentPeriodEnd);
  const periodPct = progressPct(currentPeriodStart, currentPeriodEnd);

  // Räkna ut nästa händelse
  let nextEvent: {
    icon: React.ReactNode;
    label: string;
    detail: string;
    tone: 'neutral' | 'warning' | 'danger' | 'success';
  };
  if (cancelAtPeriodEnd && currentPeriodEnd) {
    nextEvent = {
      icon: <AlertTriangle className="h-4 w-4" />,
      label: 'Avslutas',
      detail: `${shortDateSv(currentPeriodEnd)} (${daysLeft ?? 0} dagar)`,
      tone: 'danger',
    };
  } else if (status === 'paused' && pausedUntil) {
    nextEvent = {
      icon: <Play className="h-4 w-4" />,
      label: 'Återupptas automatiskt',
      detail: shortDateSv(pausedUntil),
      tone: 'warning',
    };
  } else if (status === 'paused') {
    nextEvent = {
      icon: <Pause className="h-4 w-4" />,
      label: 'Pausad',
      detail: 'Inget återupptagningsdatum',
      tone: 'warning',
    };
  } else if (status === 'active' && currentPeriodEnd) {
    nextEvent = {
      icon: <RefreshCw className="h-4 w-4" />,
      label: 'Förnyas',
      detail: `${shortDateSv(currentPeriodEnd)} (${daysLeft ?? 0} dagar)`,
      tone: 'success',
    };
  } else {
    nextEvent = {
      icon: <Calendar className="h-4 w-4" />,
      label: 'Status',
      detail: status,
      tone: 'neutral',
    };
  }

  const statusPill = (() => {
    if (cancelAtPeriodEnd) return { label: 'Avslutas vid periodslut', tone: 'danger' as const };
    if (status === 'active') return { label: 'Aktiv', tone: 'success' as const };
    if (status === 'paused') return { label: 'Pausad', tone: 'warning' as const };
    if (status === 'trialing') return { label: 'Trial', tone: 'neutral' as const };
    if (status === 'past_due') return { label: 'Förfallen', tone: 'danger' as const };
    if (status === 'canceled' || status === 'cancelled') return { label: 'Avslutad', tone: 'neutral' as const };
    return { label: status, tone: 'neutral' as const };
  })();

  const toneClass = (tone: 'neutral' | 'warning' | 'danger' | 'success') =>
    tone === 'success'
      ? 'bg-emerald-500/10 text-emerald-700'
      : tone === 'warning'
        ? 'bg-amber-500/10 text-amber-700'
        : tone === 'danger'
          ? 'bg-destructive/10 text-destructive'
          : 'bg-muted text-muted-foreground';

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <header className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">Abonnemangsstatus</h3>
        <span
          className={cn(
            'rounded-full px-2.5 py-0.5 text-xs font-medium',
            toneClass(statusPill.tone),
          )}
        >
          {statusPill.label}
        </span>
      </header>

      {currentPeriodStart && currentPeriodEnd && (
        <div className="mb-4">
          <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
            <span>{shortDateSv(currentPeriodStart)}</span>
            <span>{shortDateSv(currentPeriodEnd)}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div
              className={cn(
                'h-full transition-all',
                cancelAtPeriodEnd ? 'bg-destructive' : 'bg-primary',
              )}
              style={{ width: `${periodPct}%` }}
            />
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {daysLeft != null ? `${daysLeft} dagar kvar i perioden` : ''}
          </p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 text-sm">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            Nästa händelse
          </p>
          <p
            className={cn(
              'mt-1 inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-sm font-medium',
              toneClass(nextEvent.tone),
            )}
          >
            {nextEvent.icon}
            {nextEvent.label}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">{nextEvent.detail}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            Månadspris
          </p>
          <p className="mt-1 text-sm font-semibold text-foreground">
            {fmtKr(monthlyPriceOre)}
          </p>
        </div>
      </div>
    </div>
  );
}