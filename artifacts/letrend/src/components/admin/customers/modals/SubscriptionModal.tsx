'use client';

import { useState } from 'react';
import { AdminFormDialog } from '@/components/admin/ui/feedback/AdminFormDialog';
import { AdminField } from '@/components/admin/ui/form/AdminField';
import { PriceInput } from '@/components/admin/ui/form/PriceInput';
import { useCustomerMutation } from '@/hooks/admin/useCustomerMutation';
import { oreToSek } from '@/lib/admin/money';
import { todayDateInput } from '@/lib/admin/time';
import type { CustomerDetail } from '@/hooks/admin/useCustomerDetail';
import type { CustomerSubscription } from '@/lib/admin/dtos/billing';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import ConfirmActionDialog from '@/components/admin/ConfirmActionDialog';

type Action = 'none' | 'cancel_at_period_end' | 'cancel_now' | 'pause' | 'resume';

export default function SubscriptionModal({
  open,
  onClose,
  customerId,
  customer,
  subscription,
}: {
  open: boolean;
  onClose: () => void;
  customerId: string;
  customer: CustomerDetail;
  subscription: CustomerSubscription | null;
}) {
  const [priceOre, setPriceOre] = useState(customer.monthly_price ?? 0);
  const [action, setAction] = useState<Action>('none');
  const [pauseUntil, setPauseUntil] = useState(customer.paused_until ?? '');
  const [confirmOpen, setConfirmOpen] = useState(false);

  const updatePrice = useCustomerMutation(customerId, 'change_subscription_price');
  const pauseSub = useCustomerMutation(customerId, 'pause_subscription');
  const resumeSub = useCustomerMutation(customerId, 'resume_subscription');
  const cancelSub = useCustomerMutation(customerId, 'cancel_subscription');

  const isPending = updatePrice.isPending || pauseSub.isPending || resumeSub.isPending || cancelSub.isPending;

  const handleSave = async () => {
    try {
      // 1. Check price change
      if (priceOre !== customer.monthly_price) {
        await updatePrice.mutateAsync({
          monthly_price: oreToSek(priceOre),
          mode: 'next_period',
        });
      }

      // 2. Handle status action
      if (action === 'cancel_at_period_end') {
        await cancelSub.mutateAsync({ mode: 'end_of_period' });
      } else if (action === 'cancel_now') {
        await cancelSub.mutateAsync({ mode: 'immediate' });
      } else if (action === 'pause') {
        await pauseSub.mutateAsync({ pause_until: pauseUntil || null });
      } else if (action === 'resume') {
        await resumeSub.mutateAsync({});
      }

      toast.success('Abonnemanget har uppdaterats');
      onClose();
    } catch {
      // Error handled by mutation or toast
    }
  };

  const showConfirm = action === 'cancel_now';

  const onConfirmClick = () => {
    if (showConfirm) {
      setConfirmOpen(true);
    } else {
      handleSave();
    }
  };

  return (
    <>
      <AdminFormDialog
        open={open}
        onClose={onClose}
        title="Hantera abonnemang"
        description={customer.business_name}
        size="md"
        footer={
          <>
            <button onClick={onClose} className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-accent">
              Avbryt
            </button>
            <button
              onClick={onConfirmClick}
              disabled={isPending}
              className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
            >
              {isPending ? 'Sparar...' : 'Spara ändring'}
            </button>
          </>
        }
      >
        <div className="space-y-6">
          <AdminField label="Månadspris" hint="Ändringen slår igenom vid nästa fakturering">
            <PriceInput
              valueOre={priceOre}
              onChangeOre={setPriceOre}
            />
          </AdminField>

          <div className="space-y-3">
            <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Statusåtgärd</label>
            <div className="grid gap-2">
              <ActionOption
                id="none"
                label="Behåll som nu"
                description={subscription?.cancel_at_period_end ? 'Uppsagd vid periodslut' : customer.paused_until ? `Pausad t.o.m. ${customer.paused_until}` : 'Aktivt och löpande'}
                checked={action === 'none'}
                onChange={() => setAction('none')}
              />
              
              {!subscription?.cancel_at_period_end && !customer.paused_until && (
                <>
                  <ActionOption
                    id="cancel_at_period_end"
                    label="Avsluta vid periodslut"
                    description="Stoppar automatisk förnyelse. Kunden har tillgång perioden ut."
                    checked={action === 'cancel_at_period_end'}
                    onChange={() => setAction('cancel_at_period_end')}
                  />
                  <ActionOption
                    id="pause"
                    label="Planera paus"
                    description="Pausa debitering och CM-arbete till ett visst datum."
                    checked={action === 'pause'}
                    onChange={() => setAction('pause')}
                  />
                </>
              )}

              {(subscription?.cancel_at_period_end || customer.paused_until) && (
                <ActionOption
                  id="resume"
                  label="Återaktivera / Häv paus"
                  description="Gör abonnemanget aktivt och löpande igen."
                  checked={action === 'resume'}
                  onChange={() => setAction('resume')}
                />
              )}

              <ActionOption
                id="cancel_now"
                label="Avsluta omedelbart"
                description="Stänger av allt direkt. Ingen återbetalning sker automatiskt."
                checked={action === 'cancel_now'}
                onChange={() => setAction('cancel_now')}
                danger
              />
            </div>
          </div>

          {action === 'pause' && (
            <AdminField label="Pausa till och med">
              <input
                type="date"
                min={todayDateInput()}
                value={pauseUntil}
                onChange={(e) => setPauseUntil(e.target.value)}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              />
            </AdminField>
          )}
        </div>
      </AdminFormDialog>

      <ConfirmActionDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Avsluta abonnemang omedelbart?"
        description="Detta stänger av kundens tillgång och stoppar all fakturering direkt. Är du säker?"
        confirmLabel="Ja, avsluta nu"
        onConfirm={handleSave}
        pending={isPending}
      />
    </>
  );
}

function ActionOption({ 
  id, label, description, checked, onChange, danger 
}: { 
  id: string, label: string, description: string, checked: boolean, onChange: () => void, danger?: boolean 
}) {
  return (
    <label
      className={cn(
        "flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors",
        checked 
          ? (danger ? "border-status-danger-fg bg-status-danger-bg/10" : "border-primary bg-primary/5") 
          : "border-border hover:bg-accent"
      )}
    >
      <input id={id} type="radio" name="sub-action" checked={checked} onChange={onChange} className="mt-1 h-4 w-4 text-primary" />
      <div className="min-w-0 flex-1">
        <div className={cn("text-sm font-semibold", danger && checked ? "text-status-danger-fg" : "text-foreground")}>{label}</div>
        <div className="text-[11px] text-muted-foreground leading-tight mt-0.5">{description}</div>
      </div>
    </label>
  );
}
