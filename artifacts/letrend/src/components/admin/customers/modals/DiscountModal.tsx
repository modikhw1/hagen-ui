'use client';

import { useEffect, useMemo, useState } from 'react';
import { AdminFormDialog } from '@/components/admin/ui/feedback/AdminFormDialog';
import { AdminField } from '@/components/admin/ui/form/AdminField';
import { ADMIN_MODAL_INPUT_CLS } from '@/components/admin/ui/adminModalTokens';
import { PriceInput } from '@/components/admin/ui/form/PriceInput';
import { useAdminRefresh } from '@/hooks/admin/useAdminRefresh';
import { apiClient, ApiError } from '@/lib/admin/api-client';
import { oreToSek, sekToOre } from '@/lib/admin/money';
import { todayDateInput } from '@/lib/admin/time';
import { toast } from 'sonner';

type DiscountType = 'none' | 'percent' | 'amount' | 'free_months';

type DiscountModalCustomer = {
  business_name?: string | null;
  discount_type?: string | null;
  discount_value?: number | null;
  discount_end_date?: string | null;
  discount_ends_at?: string | null;
};

// Min/max sanity-gränser. Server validerar också; detta är UX-skydd.
const PERCENT_MIN = 1;
const PERCENT_MAX = 100;
const MONTHS_MIN = 1;
const MONTHS_MAX = 12;
const AMOUNT_MIN_ORE = 100; // 1 kr
const AMOUNT_MAX_ORE = 100_000_00; // 100 000 kr/mån

function toLocalISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function tomorrowISO(): string {
  const t = new Date();
  t.setDate(t.getDate() + 1);
  return toLocalISODate(t);
}

export default function DiscountModal({
  open,
  onClose,
  customerId,
  customer,
}: {
  open: boolean;
  onClose: () => void;
  customerId: string;
  customer: DiscountModalCustomer;
}) {
  const initialType = (customer.discount_type || 'none') as DiscountType;
  const initialEndsAt = customer.discount_end_date || customer.discount_ends_at || '';

  const [type, setType] = useState<DiscountType>(initialType);
  const [valueOre, setValueOre] = useState<number>(
    initialType === 'amount' ? sekToOre(customer.discount_value || 0) : 0,
  );
  const [percentValue, setPercentValue] = useState<number>(
    initialType === 'percent' ? Math.round(customer.discount_value || 0) : 0,
  );
  const [monthsValue, setMonthsValue] = useState<number>(
    initialType === 'free_months' ? Math.round(customer.discount_value || 0) : 0,
  );
  const [endsAt, setEndsAt] = useState<string>(initialEndsAt);
  const [submitting, setSubmitting] = useState(false);
  // Idempotency-nyckel per operatörs-intention. Roteras när payload-fält ändras
  // så att en NY intention får en NY nyckel, men retry/dubbelklick återanvänder.
  const [idempotencyToken, setIdempotencyToken] = useState<string>(() => crypto.randomUUID());
  const refresh = useAdminRefresh();

  useEffect(() => {
    if (!open) return;
    const nextType = (customer.discount_type || 'none') as DiscountType;
    setType(nextType);
    setValueOre(nextType === 'amount' ? sekToOre(customer.discount_value || 0) : 0);
    setPercentValue(nextType === 'percent' ? Math.round(customer.discount_value || 0) : 0);
    setMonthsValue(nextType === 'free_months' ? Math.round(customer.discount_value || 0) : 0);
    setEndsAt(customer.discount_end_date || customer.discount_ends_at || '');
    setIdempotencyToken(crypto.randomUUID());
  }, [customer, open]);

  // Rotera idempotency-nyckel vid varje meningsfull ändring av payload.
  useEffect(() => {
    if (!open) return;
    setIdempotencyToken(crypto.randomUUID());
  }, [type, valueOre, percentValue, monthsValue, endsAt, open]);

  const minEndDate = tomorrowISO();

  // Validering: tom/no-op-detektering + range-checks.
  const validation = useMemo<{ ok: boolean; reason?: string; noop?: boolean }>(() => {
    if (type === 'none') {
      if (initialType === 'none') return { ok: false, noop: true, reason: 'Det finns ingen rabatt att ta bort' };
      return { ok: true };
    }
    if (type === 'percent') {
      if (!Number.isInteger(percentValue) || percentValue < PERCENT_MIN || percentValue > PERCENT_MAX) {
        return { ok: false, reason: `Procent måste vara heltal ${PERCENT_MIN}–${PERCENT_MAX}` };
      }
    } else if (type === 'amount') {
      if (!Number.isInteger(valueOre) || valueOre < AMOUNT_MIN_ORE || valueOre > AMOUNT_MAX_ORE) {
        return { ok: false, reason: `Belopp måste vara mellan ${AMOUNT_MIN_ORE / 100} och ${AMOUNT_MAX_ORE / 100} kr` };
      }
    } else if (type === 'free_months') {
      if (!Number.isInteger(monthsValue) || monthsValue < MONTHS_MIN || monthsValue > MONTHS_MAX) {
        return { ok: false, reason: `Antal månader måste vara heltal ${MONTHS_MIN}–${MONTHS_MAX}` };
      }
    }
    if ((type === 'percent' || type === 'amount') && endsAt && endsAt < minEndDate) {
      return { ok: false, reason: 'Slutdatum måste ligga i framtiden' };
    }
    return { ok: true };
  }, [type, percentValue, valueOre, monthsValue, endsAt, initialType, minEndDate]);

  const handleSave = async () => {
    if (!validation.ok) {
      if (validation.reason) toast.error(validation.reason);
      return;
    }
    setSubmitting(true);
    try {
      if (type === 'none') {
        await apiClient.del(`/api/admin/customers/${customerId}/discount`, {
          headers: { 'Idempotency-Key': idempotencyToken },
        });
      } else {
        const today = todayDateInput();
        const payload =
          type === 'free_months'
            ? {
                type,
                duration_months: monthsValue,
                start_date: null,
                end_date: null,
                idempotency_token: idempotencyToken,
              }
            : {
                type,
                value: type === 'percent' ? percentValue : oreToSek(valueOre),
                ongoing: !endsAt,
                duration_months: null,
                start_date: endsAt ? today : null,
                end_date: endsAt || null,
                idempotency_token: idempotencyToken,
              };

        await apiClient.post(`/api/admin/customers/${customerId}/discount`, payload, {
          headers: { 'Idempotency-Key': idempotencyToken },
        });
      }

      toast.success('Rabatten har uppdaterats');
      await refresh([
        { type: 'customer', customerId },
        { type: 'customer-billing', customerId },
        'customers',
      ]);
      onClose();
    } catch (error) {
      const msg =
        error instanceof ApiError
          ? error.message
          : error instanceof Error
            ? error.message
            : 'Kunde inte spara rabatt';
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const canSubmit = validation.ok && !submitting;

  return (
    <AdminFormDialog
      open={open}
      onClose={onClose}
      title="Hantera rabatt"
      description={customer.business_name}
      size="sm"
      footer={
        <>
          <button onClick={onClose} className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-accent">
            Avbryt
          </button>
          <button
            onClick={handleSave}
            disabled={!canSubmit}
            className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
          >
            {submitting ? 'Sparar...' : type === 'none' ? 'Ta bort rabatt' : 'Spara rabatt'}
          </button>
        </>
      }
    >
      <div className="space-y-5">
        <AdminField label="Rabatt-typ">
          <select
            value={type}
            onChange={(e) => setType(e.target.value as DiscountType)}
            className={ADMIN_MODAL_INPUT_CLS}
          >
            <option value="none">Ingen rabatt</option>
            <option value="percent">Procent (%)</option>
            <option value="amount">Fast belopp (SEK / mån)</option>
            <option value="free_months">Gratis månader</option>
          </select>
        </AdminField>

        {type !== 'none' && (
          <>
            <AdminField label={type === 'percent' ? 'Procent' : type === 'amount' ? 'Belopp' : 'Antal månader'}>
              {type === 'amount' ? (
                <PriceInput
                  valueOre={valueOre}
                  onChangeOre={setValueOre}
                />
              ) : (
                <div className="relative">
                  <input
                    type="number"
                    inputMode="numeric"
                    step={1}
                    min={type === 'percent' ? PERCENT_MIN : MONTHS_MIN}
                    max={type === 'percent' ? PERCENT_MAX : MONTHS_MAX}
                    value={type === 'percent' ? percentValue : monthsValue}
                    onChange={(e) => {
                      // Tillåt endast heltal – strippa allt annat.
                      const raw = e.target.value.replace(/[^\d]/g, '');
                      const v = raw === '' ? 0 : Number.parseInt(raw, 10);
                      if (type === 'percent') setPercentValue(v);
                      else setMonthsValue(v);
                    }}
                    className={ADMIN_MODAL_INPUT_CLS}
                  />
                  <span className="absolute right-3 top-2 text-xs text-muted-foreground">
                    {type === 'percent' ? '%' : 'st'}
                  </span>
                </div>
              )}
            </AdminField>

            {/* Slutdatum är meningslöst för gratis-månader (servern ignorerar det). */}
            {type !== 'free_months' && (
              <AdminField label="Gäller t.o.m." hint="Valfritt slutdatum (lämna tomt för löpande rabatt)">
                <input
                  type="date"
                  min={minEndDate}
                  value={endsAt}
                  onChange={(e) => setEndsAt(e.target.value)}
                  className={ADMIN_MODAL_INPUT_CLS}
                />
              </AdminField>
            )}
          </>
        )}

        {!validation.ok && validation.reason && (
          <p className="text-xs text-status-danger-fg">{validation.reason}</p>
        )}
      </div>
    </AdminFormDialog>
  );
}
