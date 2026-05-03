'use client';

import { useEffect, useState } from 'react';
import { AdminFormDialog } from '@/components/admin/ui/feedback/AdminFormDialog';
import { AdminField } from '@/components/admin/ui/form/AdminField';
import { PriceInput } from '@/components/admin/ui/form/PriceInput';
import { oreToSek, sekToOre } from '@/lib/admin/money';
import { todayDateInput } from '@/lib/admin/time';
import { toast } from 'sonner';

type DiscountModalCustomer = {
  business_name?: string | null;
  discount_type?: string | null;
  discount_value?: number | null;
  discount_end_date?: string | null;
  discount_ends_at?: string | null;
};

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
  const [type, setType] = useState<string>(customer.discount_type || 'none');
  const [valueOre, setValueOre] = useState<number>(
    customer.discount_type === 'amount' ? sekToOre(customer.discount_value || 0) : 0,
  );
  const [percentValue, setPercentValue] = useState<number>(type === 'percent' ? customer.discount_value || 0 : 0);
  const [monthsValue, setMonthsValue] = useState<number>(type === 'free_months' ? customer.discount_value || 0 : 0);
  const [endsAt, setEndsAt] = useState<string>(customer.discount_end_date || customer.discount_ends_at || '');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    const nextType = customer.discount_type || 'none';
    setType(nextType);
    setValueOre(nextType === 'amount' ? sekToOre(customer.discount_value || 0) : 0);
    setPercentValue(nextType === 'percent' ? customer.discount_value || 0 : 0);
    setMonthsValue(nextType === 'free_months' ? customer.discount_value || 0 : 0);
    setEndsAt(customer.discount_end_date || customer.discount_ends_at || '');
  }, [customer, open]);

  const handleSave = async () => {
    setSubmitting(true);
    try {
      if (type === 'none') {
        const res = await fetch(`/api/admin/customers/${customerId}/discount`, {
          method: 'DELETE',
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || 'Kunde inte ta bort rabatt');
        }
      } else {
        const today = todayDateInput();
        const payload =
          type === 'free_months'
            ? {
                type,
                duration_months: monthsValue,
                start_date: null,
                end_date: null,
                idempotency_token: crypto.randomUUID(),
              }
            : {
                type,
                value: type === 'percent' ? percentValue : oreToSek(valueOre),
                ongoing: !endsAt,
                duration_months: null,
                start_date: endsAt ? today : null,
                end_date: endsAt || null,
                idempotency_token: crypto.randomUUID(),
              };

        const res = await fetch(`/api/admin/customers/${customerId}/discount`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || 'Kunde inte spara rabatt');
        }
      }

      toast.success('Rabatten har uppdaterats');
      onClose();
      window.location.reload();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Kunde inte spara rabatt');
    } finally {
      setSubmitting(false);
    }
  };

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
            disabled={submitting}
            className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
          >
            {submitting ? 'Sparar...' : 'Spara rabatt'}
          </button>
        </>
      }
    >
      <div className="space-y-5">
        <AdminField label="Rabatt-typ">
          <select
            value={type}
            onChange={(e) => setType(e.target.value)}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
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
                    value={type === 'percent' ? percentValue : monthsValue}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      if (type === 'percent') setPercentValue(v);
                      else setMonthsValue(v);
                    }}
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                  />
                  <span className="absolute right-3 top-2 text-xs text-muted-foreground">
                    {type === 'percent' ? '%' : 'st'}
                  </span>
                </div>
              )}
            </AdminField>

            <AdminField label="Gäller t.o.m." hint="Valfritt slutdatum">
              <input
                type="date"
                min={todayDateInput()}
                value={endsAt}
                onChange={(e) => setEndsAt(e.target.value)}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              />
            </AdminField>
          </>
        )}
      </div>
    </AdminFormDialog>
  );
}
