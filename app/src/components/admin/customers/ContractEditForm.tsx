'use client';

import { useMemo, useState } from 'react';
import { calculateFirstInvoice, inferFirstInvoiceBehavior } from '@/lib/billing/first-invoice';
import type { CustomerDetail } from '@/hooks/admin/useCustomerDetail';

export default function ContractEditForm({
  customer,
  onSaved,
}: {
  customer: CustomerDetail;
  onSaved: () => void;
}) {
  const [pricingStatus, setPricingStatus] = useState<'fixed' | 'unknown'>(
    customer.pricing_status,
  );
  const [monthlyPrice, setMonthlyPrice] = useState(customer.monthly_price ?? 0);
  const [subscriptionInterval, setSubscriptionInterval] = useState<
    'month' | 'quarter' | 'year'
  >(customer.subscription_interval);
  const [contractStartDate, setContractStartDate] = useState(
    customer.contract_start_date || new Date().toISOString().slice(0, 10),
  );
  const [billingDayOfMonth, setBillingDayOfMonth] = useState(
    customer.billing_day_of_month || 25,
  );
  const [waiveDaysUntilBilling, setWaiveDaysUntilBilling] = useState(false);
  const [upcomingMonthlyPrice, setUpcomingMonthlyPrice] = useState(
    customer.upcoming_price_change?.price || 0,
  );
  const [upcomingPriceEffectiveDate, setUpcomingPriceEffectiveDate] = useState(
    customer.upcoming_price_change?.effective_date || '',
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const preview = useMemo(
    () =>
      calculateFirstInvoice({
        pricingStatus,
        recurringPriceSek: monthlyPrice,
        startDate: contractStartDate,
        billingDay: billingDayOfMonth,
        waiveDaysUntilBilling,
      }),
    [
      billingDayOfMonth,
      contractStartDate,
      monthlyPrice,
      pricingStatus,
      waiveDaysUntilBilling,
    ],
  );

  const save = async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/admin/customers/${customer.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          pricing_status: pricingStatus,
          monthly_price: pricingStatus === 'fixed' ? monthlyPrice : 0,
          subscription_interval: subscriptionInterval,
          contract_start_date: contractStartDate,
          billing_day_of_month: billingDayOfMonth,
          first_invoice_behavior: inferFirstInvoiceBehavior({
            startDate: contractStartDate,
            billingDay: billingDayOfMonth,
            waiveDaysUntilBilling,
          }),
          upcoming_monthly_price: upcomingMonthlyPrice > 0 ? upcomingMonthlyPrice : null,
          upcoming_price_effective_date: upcomingPriceEffectiveDate || null,
        }),
      });
      const payload = await res.json();

      if (!res.ok) {
        throw new Error(payload.error || 'Kunde inte spara avtal');
      }

      onSaved();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Kunde inte spara avtal');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <select
          value={pricingStatus}
          onChange={(event) =>
            setPricingStatus(event.target.value as 'fixed' | 'unknown')
          }
          className="w-full rounded-md border border-border bg-background px-3 py-2.5 text-sm"
        >
          <option value="fixed">Fast pris</option>
          <option value="unknown">Pris ej satt</option>
        </select>
        <input
          type="number"
          min={0}
          value={monthlyPrice}
          disabled={pricingStatus === 'unknown'}
          onChange={(event) =>
            setMonthlyPrice(Math.max(0, Number(event.target.value) || 0))
          }
          className="w-full rounded-md border border-border bg-background px-3 py-2.5 text-sm disabled:opacity-50"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <select
          value={subscriptionInterval}
          onChange={(event) =>
            setSubscriptionInterval(
              event.target.value as 'month' | 'quarter' | 'year',
            )
          }
          className="w-full rounded-md border border-border bg-background px-3 py-2.5 text-sm"
        >
          <option value="month">Manad</option>
          <option value="quarter">Kvartal</option>
          <option value="year">Ar</option>
        </select>
        <input
          type="number"
          min={1}
          max={28}
          value={billingDayOfMonth}
          onChange={(event) =>
            setBillingDayOfMonth(
              Math.max(1, Math.min(28, Number(event.target.value) || 25)),
            )
          }
          className="w-full rounded-md border border-border bg-background px-3 py-2.5 text-sm"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <input
          type="date"
          value={contractStartDate}
          onChange={(event) => setContractStartDate(event.target.value)}
          className="w-full rounded-md border border-border bg-background px-3 py-2.5 text-sm"
        />
        <input
          type="date"
          value={upcomingPriceEffectiveDate}
          onChange={(event) => setUpcomingPriceEffectiveDate(event.target.value)}
          className="w-full rounded-md border border-border bg-background px-3 py-2.5 text-sm"
        />
      </div>

      <input
        type="number"
        min={0}
        value={upcomingMonthlyPrice}
        onChange={(event) =>
          setUpcomingMonthlyPrice(Math.max(0, Number(event.target.value) || 0))
        }
        className="w-full rounded-md border border-border bg-background px-3 py-2.5 text-sm"
      />

      <label className="flex items-center gap-2 text-sm text-foreground">
        <input
          type="checkbox"
          checked={waiveDaysUntilBilling}
          onChange={(event) => setWaiveDaysUntilBilling(event.target.checked)}
        />
        Bjud pa dagarna fram till nasta faktureringsdag
      </label>

      <div className="rounded-md border border-border bg-secondary/40 p-3">
        <div className="text-sm text-foreground">{preview.explanation}</div>
        <div className="mt-1 text-sm font-semibold text-foreground">
          {preview.amountSek !== null
            ? `Forsta faktura: ${preview.amountSek.toLocaleString('sv-SE')} kr`
            : 'Forsta faktura beraknas nar pris ar satt'}
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="flex justify-end">
        <button
          onClick={() => void save()}
          disabled={loading}
          className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
        >
          {loading ? 'Sparar...' : 'Spara avtal'}
        </button>
      </div>
    </div>
  );
}
