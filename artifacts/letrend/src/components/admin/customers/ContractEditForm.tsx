'use client';

import { useEffect, useMemo, useState } from 'react';
import { calculateFirstInvoice, inferFirstInvoiceBehavior } from '@/lib/billing/first-invoice';
import type { CustomerDetail } from '@/hooks/admin/useCustomerDetail';
import { ApiError, apiClient } from '@/lib/admin/api-client';
import { formatPriceSEK } from '@/lib/admin/money';
import { todayDateInput } from '@/lib/admin/time';
import { ADMIN_MODAL_INPUT_CLS } from '@/components/admin/ui/adminModalTokens';

const PRICE_MAX_KR = 1_000_000;

/** Strict positive integer parser — no decimals, scientific, signs or spaces. */
function parseStrictInt(value: string): number {
  const cleaned = value.replace(/[^\d]/g, '');
  if (!cleaned) return 0;
  const n = Number(cleaned);
  return Number.isFinite(n) ? Math.min(n, PRICE_MAX_KR) : 0;
}

function genIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

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
    customer.contract_start_date || todayDateInput(),
  );
  const [billingDayOfMonth, setBillingDayOfMonth] = useState(
    customer.billing_day_of_month || 25,
  );
  const [waiveDaysUntilBilling, setWaiveDaysUntilBilling] = useState(false);
  const [upcomingMonthlyPrice, setUpcomingMonthlyPrice] = useState(
    customer.upcoming_price_change?.price_ore
      ? Math.round(customer.upcoming_price_change.price_ore / 100)
      : 0,
  );
  const [upcomingPriceEffectiveDate, setUpcomingPriceEffectiveDate] = useState(
    customer.upcoming_price_change?.effective_date || '',
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Idempotency-Key per operatörsintention (modal-instans + payload-fingerprint).
  // Roteras när relevanta fält ändras så att en retry på "samma" intention
  // dedupliceras serverside, men en ny intention får en ny nyckel.
  const payloadFingerprint = [
    pricingStatus,
    monthlyPrice,
    subscriptionInterval,
    contractStartDate,
    billingDayOfMonth,
    waiveDaysUntilBilling,
    upcomingMonthlyPrice,
    upcomingPriceEffectiveDate,
  ].join('|');
  const [idempotencyKey, setIdempotencyKey] = useState(genIdempotencyKey);
  useEffect(() => {
    setIdempotencyKey(genIdempotencyKey());
  }, [payloadFingerprint]);

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

  // Par-validering: upcoming pris och effektivt datum måste anges tillsammans.
  const upcomingPairError = (() => {
    const hasPrice = upcomingMonthlyPrice > 0;
    const hasDate = Boolean(upcomingPriceEffectiveDate);
    if (hasPrice !== hasDate) {
      return 'Kommande pris kräver både belopp och startdatum.';
    }
    if (hasDate && upcomingPriceEffectiveDate < todayDateInput()) {
      return 'Kommande pris kan inte gälla bakåt i tiden.';
    }
    return null;
  })();

  const canSave = !loading && !upcomingPairError;

  const save = async () => {
    if (upcomingPairError) {
      setError(upcomingPairError);
      return;
    }
    setLoading(true);
    setError(null);

    try {
      await apiClient.patch(
        `/api/admin/customers/${customer.id}`,
        {
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
        },
        { headers: { 'Idempotency-Key': idempotencyKey } },
      );

      onSaved();
    } catch (e: unknown) {
      const msg = e instanceof ApiError
        ? e.message
        : e instanceof Error
          ? e.message
          : 'Kunde inte spara avtal';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <select
          value={pricingStatus}
          onChange={(event) => setPricingStatus(event.target.value as 'fixed' | 'unknown')}
          className={ADMIN_MODAL_INPUT_CLS}
        >
          <option value="fixed">Fast pris</option>
          <option value="unknown">Pris ej satt</option>
        </select>
        <input
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          value={monthlyPrice ? String(monthlyPrice) : ''}
          placeholder="Månadspris (kr)"
          disabled={pricingStatus === 'unknown'}
          onChange={(event) => setMonthlyPrice(parseStrictInt(event.target.value))}
          className={`${ADMIN_MODAL_INPUT_CLS} disabled:opacity-50`}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <select
          value={subscriptionInterval}
          onChange={(event) =>
            setSubscriptionInterval(event.target.value as 'month' | 'quarter' | 'year')
          }
          className={ADMIN_MODAL_INPUT_CLS}
        >
          <option value="month">Månad</option>
          <option value="quarter">Kvartal</option>
          <option value="year">År</option>
        </select>
        <input
          type="number"
          min={1}
          max={28}
          step={1}
          value={billingDayOfMonth}
          onChange={(event) => {
            const cleaned = event.target.value.replace(/[^\d]/g, '');
            const n = cleaned ? Number(cleaned) : 25;
            setBillingDayOfMonth(Math.max(1, Math.min(28, n)));
          }}
          className={ADMIN_MODAL_INPUT_CLS}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <input
          type="date"
          value={contractStartDate}
          onChange={(event) => setContractStartDate(event.target.value)}
          className={ADMIN_MODAL_INPUT_CLS}
        />
        <input
          type="date"
          min={todayDateInput()}
          value={upcomingPriceEffectiveDate}
          onChange={(event) => setUpcomingPriceEffectiveDate(event.target.value)}
          className={ADMIN_MODAL_INPUT_CLS}
        />
      </div>

      <input
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        value={upcomingMonthlyPrice ? String(upcomingMonthlyPrice) : ''}
        placeholder="Kommande månadspris (kr)"
        onChange={(event) => setUpcomingMonthlyPrice(parseStrictInt(event.target.value))}
        className={ADMIN_MODAL_INPUT_CLS}
      />

      <label className="flex items-center gap-2 text-sm text-foreground">
        <input
          type="checkbox"
          checked={waiveDaysUntilBilling}
          onChange={(event) => setWaiveDaysUntilBilling(event.target.checked)}
        />
        Bjud på dagarna fram till nästa faktureringsdag
      </label>

      <div className="rounded-md border border-border bg-secondary/40 p-3">
        <div className="text-sm text-foreground">{preview.explanation}</div>
        <div className="mt-1 text-sm font-semibold text-foreground">
          {preview.amountSek !== null
            ? `Första faktura: ${formatPriceSEK(preview.amountSek, { fallback: '-' })}`
            : 'Första faktura beräknas när pris är satt'}
        </div>
      </div>

      {upcomingPairError && !error ? (
        <div className="rounded-md border border-status-warning-fg/30 bg-status-warning-bg/40 px-3 py-2 text-sm text-status-warning-fg">
          {upcomingPairError}
        </div>
      ) : null}

      {error ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      <div className="flex justify-end">
        <button
          onClick={() => void save()}
          disabled={!canSave}
          className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
        >
          {loading ? 'Sparar...' : 'Spara avtal'}
        </button>
      </div>
    </div>
  );
}
