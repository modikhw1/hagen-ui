'use client';

import { useEffect, useState } from 'react';
import { AdminFormDialog } from '@/components/admin/ui/feedback/AdminFormDialog';
import { AdminField } from '@/components/admin/ui/form/AdminField';
import { PriceInput } from '@/components/admin/ui/form/PriceInput';
import { oreToSek, sekToOre } from '@/lib/admin/money';
import { toast } from 'sonner';
import { applyDiscountLineItem, removeDiscount } from '@/app/admin/_actions/billing';

type DiscountModalCustomer = {
  business_name?: string | null;
  discount_type?: string | null;
  discount_value?: number | null;
  discount_end_date?: string | null;
  discount_ends_at?: string | null;
};

type DiscountKind = 'amount' | 'percent' | 'free_months';

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
  const hasLegacyCoupon = Boolean(
    customer.discount_type && customer.discount_type !== 'none',
  );

  const [kind, setKind] = useState<DiscountKind>('amount');
  const [amountOre, setAmountOre] = useState<number>(sekToOre(0));
  const [percentValue, setPercentValue] = useState<number>(10);
  const [months, setMonths] = useState<number>(1);
  const [description, setDescription] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);
  const [removing, setRemoving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setKind('amount');
    setAmountOre(0);
    setPercentValue(10);
    setMonths(1);
    setDescription('');
  }, [open]);

  const handleApply = async () => {
    setSubmitting(true);
    try {
      const payload =
        kind === 'amount'
          ? {
              type: 'amount' as const,
              value: oreToSek(amountOre),
              months,
              description: description || undefined,
              idempotency_token: crypto.randomUUID(),
            }
          : kind === 'percent'
            ? {
                type: 'percent' as const,
                value: percentValue,
                months,
                description: description || undefined,
                idempotency_token: crypto.randomUUID(),
              }
            : {
                type: 'free_months' as const,
                months,
                description: description || undefined,
                idempotency_token: crypto.randomUUID(),
              };

      const result = await applyDiscountLineItem({
        customerId,
        payload,
      });

      if ('error' in result) {
        throw new Error(result.error.message);
      }

      const total = Math.abs(result.data.totalOre) / 100;
      toast.success(
        `Rabatt lades till — ${result.data.months} månad(er), totalt ${total.toLocaleString('sv-SE')} kr`,
      );
      onClose();
      window.location.reload();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Kunde inte spara rabatt');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRemoveLegacy = async () => {
    setRemoving(true);
    try {
      const result = await removeDiscount({ customerId });
      if ('error' in result) throw new Error(result.error.message);
      toast.success('Befintlig rabatt borttagen');
      onClose();
      window.location.reload();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Kunde inte ta bort rabatt');
    } finally {
      setRemoving(false);
    }
  };

  const valueDisabled = kind === 'free_months';

  return (
    <AdminFormDialog
      open={open}
      onClose={onClose}
      title="Lägg till rabatt"
      description={customer.business_name}
      size="sm"
      footer={
        <>
          <button
            onClick={onClose}
            className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-accent"
          >
            Avbryt
          </button>
          <button
            onClick={handleApply}
            disabled={submitting}
            className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
          >
            {submitting ? 'Lägger till...' : 'Lägg till rabatt'}
          </button>
        </>
      }
    >
      <div className="space-y-5">
        {hasLegacyCoupon && (
          <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200">
            <p className="font-medium">Befintlig coupon-baserad rabatt finns</p>
            <p className="mt-1">
              Typ: {customer.discount_type} · värde: {customer.discount_value}
              {customer.discount_end_date ? ` · t.o.m. ${customer.discount_end_date}` : ''}
            </p>
            <p className="mt-2">
              Nya rabatter läggs som rader på nästa faktura. Den gamla coupon-rabatten
              ligger kvar tills du tar bort den eller den löper ut.
            </p>
            <button
              onClick={handleRemoveLegacy}
              disabled={removing}
              className="mt-2 rounded-md border border-amber-400 bg-white px-3 py-1 text-xs font-medium text-amber-900 hover:bg-amber-100 disabled:opacity-50 dark:bg-amber-900 dark:text-amber-100"
            >
              {removing ? 'Tar bort...' : 'Ta bort gammal coupon-rabatt'}
            </button>
          </div>
        )}

        <div className="rounded-md bg-muted/40 p-3 text-xs text-muted-foreground">
          Rabatten läggs som en negativ rad på nästa faktura. Skapas {months > 1 ? `${months} st rader` : '1 rad'} (en per månad).
        </div>

        <AdminField label="Typ av rabatt">
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as DiscountKind)}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          >
            <option value="amount">Fast belopp (kr/månad)</option>
            <option value="percent">Procent (%)</option>
            <option value="free_months">Gratis månad(er)</option>
          </select>
        </AdminField>

        {!valueDisabled && (
          <AdminField label={kind === 'percent' ? 'Procent' : 'Belopp per månad'}>
            {kind === 'amount' ? (
              <PriceInput valueOre={amountOre} onChangeOre={setAmountOre} />
            ) : (
              <div className="relative">
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={percentValue}
                  onChange={(e) => setPercentValue(Number(e.target.value))}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                />
                <span className="absolute right-3 top-2 text-xs text-muted-foreground">%</span>
              </div>
            )}
          </AdminField>
        )}

        <AdminField
          label="Antal månader"
          hint={
            kind === 'free_months'
              ? 'Hela månadsbeloppet dras av per månad'
              : 'Rabatten läggs på så många kommande fakturor'
          }
        >
          <div className="relative">
            <input
              type="number"
              min={1}
              max={12}
              value={months}
              onChange={(e) => setMonths(Math.max(1, Math.min(12, Number(e.target.value))))}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            />
            <span className="absolute right-3 top-2 text-xs text-muted-foreground">mån</span>
          </div>
        </AdminField>

        <AdminField label="Beskrivning på fakturan" hint="Valfritt">
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={
              kind === 'free_months'
                ? 'Gratis månad'
                : kind === 'percent'
                  ? `Rabatt ${percentValue}%`
                  : `Rabatt ${oreToSek(amountOre)} kr`
            }
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          />
        </AdminField>
      </div>
    </AdminFormDialog>
  );
}
