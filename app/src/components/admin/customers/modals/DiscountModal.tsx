'use client';

import { useState } from 'react';
import { useCustomerMutation } from '@/hooks/admin/useCustomerMutation';
import { AdminFormDialog } from '@/components/admin/ui/feedback/AdminFormDialog';
import { AdminField } from '@/components/admin/ui/form/AdminField';
import { PriceInput } from '@/components/admin/ui/form/PriceInput';
import { formatSek, sekToOre, oreToSek } from '@/lib/admin/money';
import { todayDateInput } from '@/lib/admin/time';
import { toast } from 'sonner';

export default function DiscountModal({
  open,
  onClose,
  customerId,
  customer,
}: {
  open: boolean;
  onClose: () => void;
  customerId: string;
  customer: any;
}) {
  const [type, setType] = useState<string>(customer.discount_type || 'none');
  const [valueOre, setValueOre] = useState<number>(customer.discount_value || 0);
  const [percentValue, setPercentValue] = useState<number>(type === 'percent' ? customer.discount_value || 0 : 0);
  const [monthsValue, setMonthsValue] = useState<number>(type === 'free_months' ? customer.discount_value || 0 : 0);
  const [endsAt, setEndsAt] = useState<string>(customer.discount_ends_at || '');

  const mutation = useCustomerMutation(customerId, 'update_profile', {
    onSuccess: () => {
      toast.success('Rabatten har uppdaterats');
      onClose();
    },
  });

  const handleSave = async () => {
    let finalValue = 0;
    if (type === 'percent') finalValue = percentValue;
    else if (type === 'amount') finalValue = oreToSek(valueOre); // API expects SEK for amount discount
    else if (type === 'free_months') finalValue = monthsValue;

    await mutation.mutateAsync({
      discount_type: type,
      discount_value: type === 'none' ? null : finalValue,
      discount_ends_at: type === 'none' ? null : (endsAt || null),
    });
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
            disabled={mutation.isPending}
            className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
          >
            {mutation.isPending ? 'Sparar...' : 'Spara rabatt'}
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
