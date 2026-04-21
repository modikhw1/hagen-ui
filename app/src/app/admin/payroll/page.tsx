'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { formatSek } from '@/lib/admin/money';

type PayrollPayload = {
  period: {
    key: string;
    label: string;
    start_date: string;
    end_date: string;
  };
  available_periods: Array<{
    key: string;
    label: string;
  }>;
  rows: Array<{
    cm_id: string;
    cm_name: string;
    cm_email: string | null;
    commission_rate: number;
    assigned_customers: number;
    active_customers: number;
    billed_ore: number;
    payout_ore: number;
    billable_days: number;
    source: 'invoice_line_items' | 'customer_profiles_fallback';
    customer_breakdown: Array<{
      customer_id: string;
      customer_name: string;
      billed_ore: number;
      payout_ore: number;
      billable_days: number;
    }>;
  }>;
  totals: {
    cm_count: number;
    assigned_customers: number;
    active_customers: number;
    billed_ore: number;
    payout_ore: number;
    billable_days: number;
  };
  scheduled_changes: Array<{
    customer_id: string;
    customer_name: string;
    current_cm_name: string | null;
    next_cm_name: string | null;
    effective_date: string;
    handover_note: string | null;
  }>;
  schemaWarnings?: string[];
};

export default function PayrollPage() {
  const [period, setPeriod] = useState<string | null>(null);
  const { data, isLoading, error } = useQuery({
    queryKey: ['admin', 'payroll', period],
    queryFn: async () => {
      const response = await fetch(
        `/api/admin/payroll${period ? `?period=${encodeURIComponent(period)}` : ''}`,
        { credentials: 'include' },
      );
      const payload = (await response.json().catch(() => ({}))) as PayrollPayload & { error?: string };
      if (!response.ok) {
        throw new Error(payload.error || 'Kunde inte ladda payroll');
      }
      return payload;
    },
    staleTime: 60_000,
  });

  if (isLoading) {
    return <div className="py-12 text-sm text-muted-foreground">Laddar payroll...</div>;
  }

  if (error || !data) {
    return (
      <div className="rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
        {error instanceof Error ? error.message : 'Kunde inte ladda payroll.'}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="font-heading text-2xl font-bold text-foreground">Payroll</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Periodiserat ersattningsunderlag for billingperioden {data.period.label}.
          </p>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <select
            value={period ?? data.period.key}
            onChange={(event) => setPeriod(event.target.value)}
            className="rounded-md border border-border bg-card px-3 py-2 text-sm"
          >
            {data.available_periods.map((item) => (
              <option key={item.key} value={item.key}>
                {item.label}
              </option>
            ))}
          </select>
          <Link
            href="/admin/team"
            className="rounded-md border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-accent"
          >
            Till teamvyn
          </Link>
        </div>
      </div>

      {data.schemaWarnings?.length ? (
        <div className="rounded-md border border-warning/30 bg-warning/5 px-3 py-2 text-sm text-warning">
          {data.schemaWarnings[0]}
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <MetricCard label="Aktiva CMs" value={String(data.totals.cm_count)} />
        <MetricCard label="Aktiva kunder" value={String(data.totals.active_customers)} />
        <MetricCard label="Billat underlag" value={formatSek(data.totals.billed_ore)} />
        <MetricCard label="Beraknad payout" value={formatSek(data.totals.payout_ore)} />
        <MetricCard label="Billbara dagar" value={String(data.totals.billable_days)} />
      </div>

      <section className="rounded-lg border border-border bg-card p-5">
        <div className="mb-3">
          <h2 className="text-sm font-semibold text-foreground">Schemalagda handovers</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Kommande CM-byten som kommer att trada i kraft automatiskt via cron-jobbet.
          </p>
        </div>
        <div className="space-y-2">
          {data.scheduled_changes.length === 0 ? (
            <div className="rounded-md border border-border bg-secondary/20 px-3 py-3 text-sm text-muted-foreground">
              Inga schemalagda CM-byten hittades.
            </div>
          ) : (
            data.scheduled_changes.map((change) => (
              <div
                key={`${change.customer_id}-${change.effective_date}`}
                className="rounded-md border border-border bg-secondary/20 px-3 py-3 text-sm"
              >
                <div className="font-medium text-foreground">
                  {change.customer_name} · {change.current_cm_name || 'Ingen CM'} → {change.next_cm_name || 'Ingen CM'}
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  Aktivt fran {change.effective_date}
                  {change.handover_note ? ` · ${change.handover_note}` : ''}
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      <div className="space-y-4">
        {data.rows.map((row) => (
          <section key={row.cm_id} className="rounded-lg border border-border bg-card p-5">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <div className="text-base font-semibold text-foreground">{row.cm_name}</div>
                <div className="text-xs text-muted-foreground">{row.cm_email || 'Ingen e-post'}</div>
              </div>
              <div className="grid gap-3 sm:grid-cols-4">
                <MetricCard label="Kommission" value={`${Math.round(row.commission_rate * 100)}%`} compact />
                <MetricCard label="Billat" value={formatSek(row.billed_ore)} compact />
                <MetricCard label="Payout" value={formatSek(row.payout_ore)} compact />
                <MetricCard label="Dagar" value={String(row.billable_days)} compact />
              </div>
            </div>

            <div className="mt-4 overflow-hidden rounded-lg border border-border">
              <div className="grid grid-cols-[2fr_1fr_1fr_1fr] gap-4 border-b border-border bg-secondary/40 px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                <div>Kund</div>
                <div>Billat</div>
                <div>Payout</div>
                <div>Dagar</div>
              </div>
              {row.customer_breakdown.length === 0 ? (
                <div className="px-4 py-4 text-sm text-muted-foreground">
                  Inget billbart underlag i vald period.
                </div>
              ) : (
                row.customer_breakdown.map((customer) => (
                  <div
                    key={`${row.cm_id}-${customer.customer_id}`}
                    className="grid grid-cols-[2fr_1fr_1fr_1fr] gap-4 border-b border-border px-4 py-3 text-sm last:border-b-0"
                  >
                    <div className="font-medium text-foreground">{customer.customer_name}</div>
                    <div className="text-foreground">{formatSek(customer.billed_ore)}</div>
                    <div className="text-foreground">{formatSek(customer.payout_ore)}</div>
                    <div className="text-muted-foreground">{customer.billable_days}</div>
                  </div>
                ))
              )}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

function MetricCard({
  label,
  value,
  compact = false,
}: {
  label: string;
  value: string;
  compact?: boolean;
}) {
  return (
    <div className={`rounded-lg border border-border bg-card ${compact ? 'p-3' : 'p-4'}`}>
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`${compact ? 'mt-1 text-base' : 'mt-1 text-xl'} font-bold text-foreground`}>
        {value}
      </div>
    </div>
  );
}
