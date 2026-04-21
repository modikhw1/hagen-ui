'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

type SettingsPayload = {
  settings: {
    default_billing_interval: 'month' | 'quarter' | 'year';
    default_payment_terms_days: number;
    default_currency: string;
    default_commission_rate: number;
    updated_at: string | null;
  };
  schemaWarnings?: string[];
};

export default function SettingsPage() {
  const queryClient = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: ['admin', 'settings'],
    queryFn: async () => {
      const response = await fetch('/api/admin/settings', { credentials: 'include' });
      const payload = (await response.json().catch(() => ({}))) as SettingsPayload & { error?: string };
      if (!response.ok) {
        throw new Error(payload.error || 'Kunde inte ladda settings');
      }
      return payload;
    },
    staleTime: 60_000,
  });

  const [billingInterval, setBillingInterval] = useState<'month' | 'quarter' | 'year' | null>(null);
  const [paymentTerms, setPaymentTerms] = useState<string | null>(null);
  const [currency, setCurrency] = useState<string | null>(null);
  const [commissionRate, setCommissionRate] = useState<string | null>(null);
  const saveMutation = useMutation({
    mutationFn: async () => {
      const resolvedBillingInterval = billingInterval ?? data?.settings.default_billing_interval ?? 'month';
      const resolvedPaymentTerms = paymentTerms ?? String(data?.settings.default_payment_terms_days ?? 14);
      const resolvedCurrency = currency ?? data?.settings.default_currency ?? 'SEK';
      const resolvedCommissionRate =
        commissionRate ?? String(Math.round((data?.settings.default_commission_rate ?? 0.2) * 100));
      const nextPaymentTerms = Number(resolvedPaymentTerms);
      const nextCommissionRate = Number(resolvedCommissionRate);
      const response = await fetch('/api/admin/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          default_billing_interval: resolvedBillingInterval,
          default_payment_terms_days: Number.isFinite(nextPaymentTerms) ? nextPaymentTerms : 14,
          default_currency: resolvedCurrency.trim().toUpperCase(),
          default_commission_rate: (Number.isFinite(nextCommissionRate) ? nextCommissionRate : 20) / 100,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as SettingsPayload & { error?: string };
      if (!response.ok) {
        throw new Error(payload.error || 'Kunde inte spara settings');
      }
      return payload;
    },
    onSuccess: async (payload) => {
      queryClient.setQueryData(['admin', 'settings'], payload);
      await queryClient.invalidateQueries({ queryKey: ['admin', 'payroll'] });
    },
  });

  if (isLoading) {
    return <div className="py-12 text-sm text-muted-foreground">Laddar settings...</div>;
  }

  if (error || !data) {
    return (
      <div className="rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
        {error instanceof Error ? error.message : 'Kunde inte ladda settings.'}
      </div>
    );
  }

  const resolvedBillingInterval = billingInterval ?? data.settings.default_billing_interval;
  const resolvedPaymentTerms = paymentTerms ?? String(data.settings.default_payment_terms_days);
  const resolvedCurrency = currency ?? data.settings.default_currency;
  const resolvedCommissionRate =
    commissionRate ?? String(Math.round(data.settings.default_commission_rate * 100));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-bold text-foreground">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Globala driftdefaults for billing och teamkommission.
        </p>
      </div>

      {data.schemaWarnings?.length ? (
        <div className="rounded-md border border-warning/30 bg-warning/5 px-3 py-2 text-sm text-warning">
          {data.schemaWarnings[0]}
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,720px)]">
        <div className="rounded-lg border border-border bg-card p-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Default billing interval">
              <select
                value={resolvedBillingInterval}
                onChange={(event) => setBillingInterval(event.target.value as 'month' | 'quarter' | 'year')}
                className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm"
              >
                <option value="month">Month</option>
                <option value="quarter">Quarter</option>
                <option value="year">Year</option>
              </select>
            </Field>

            <Field label="Payment terms (dagar)">
              <input
                value={resolvedPaymentTerms}
                onChange={(event) => setPaymentTerms(event.target.value)}
                inputMode="numeric"
                className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm"
              />
            </Field>

            <Field label="Valuta">
              <input
                value={resolvedCurrency}
                onChange={(event) => setCurrency(event.target.value.toUpperCase())}
                className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm"
              />
            </Field>

            <Field label="Default CM-kommission (%)">
              <input
                value={resolvedCommissionRate}
                onChange={(event) => setCommissionRate(event.target.value)}
                inputMode="decimal"
                className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm"
              />
            </Field>
          </div>

          {saveMutation.isError ? (
            <div className="mt-4 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {saveMutation.error instanceof Error
                ? saveMutation.error.message
                : 'Kunde inte spara settings.'}
            </div>
          ) : null}

          {saveMutation.isSuccess ? (
            <div className="mt-4 rounded-md border border-success/30 bg-success/5 px-3 py-2 text-sm text-success">
              Settings sparades.
            </div>
          ) : null}

          <div className="mt-5 flex justify-end">
            <button
              type="button"
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending}
              className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {saveMutation.isPending ? 'Sparar...' : 'Spara settings'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="grid gap-1.5 text-sm">
      <span className="text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}
