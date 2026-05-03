'use client';

import { useMemo, useState } from 'react';
import { Alert, Skeleton } from '@mantine/core';
import { CalendarClock, Info, Receipt } from 'lucide-react';
import { toast } from 'sonner';
import ConfirmActionDialog from '@/components/admin/ConfirmActionDialog';
import { CancelPreviewPanel } from '@/components/admin/billing/subscriptions/CancelPreviewPanel';
import { AdminFormDialog } from '@/components/admin/ui/feedback/AdminFormDialog';
import { AdminField } from '@/components/admin/ui/form/AdminField';
import { PriceInput } from '@/components/admin/ui/form/PriceInput';
import { useCustomerDetail, type CustomerDetail } from '@/hooks/admin/useCustomerDetail';
import { useCustomerMutation } from '@/hooks/admin/useCustomerMutation';
import { useSubscriptionPricePreview } from '@/hooks/admin/useSubscriptionPricePreview';
import type { CustomerSubscription } from '@/lib/admin/dtos/billing';
import { oreToSek } from '@/lib/admin/money';
import { todayDateInput } from '@/lib/admin/time';
import { cn } from '@/lib/utils';

type Action =
  | 'none'
  | 'change_price'
  | 'cancel_at_period_end'
  | 'cancel_now'
  | 'pause'
  | 'resume';

type PriceMode = 'next_period' | 'now';

function fmtKr(amountOre: number): string {
  const sign = amountOre < 0 ? '-' : '';
  return `${sign}${Math.abs(Math.round(amountOre / 100)).toLocaleString('sv-SE')} kr`;
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('sv-SE');
  } catch {
    return iso;
  }
}

export default function SubscriptionModal({
  open,
  onClose,
  customerId,
  customer: initialCustomer,
  subscription,
}: {
  open: boolean;
  onClose: () => void;
  customerId: string;
  customer: CustomerDetail;
  subscription: CustomerSubscription | null;
}) {
  const detailQuery = useCustomerDetail(open ? customerId : '');
  const customer = detailQuery.data ?? initialCustomer;
  const currentPriceOre = customer.monthly_price ?? 0;

  const [priceOre, setPriceOre] = useState(currentPriceOre);
  const [priceMode, setPriceMode] = useState<PriceMode>('next_period');
  const [action, setAction] = useState<Action>('none');
  const [pauseUntil, setPauseUntil] = useState(customer.paused_until ?? '');
  const [confirmOpen, setConfirmOpen] = useState(false);

  const updatePrice = useCustomerMutation(customerId, 'change_subscription_price');
  const pauseSub = useCustomerMutation(customerId, 'pause_subscription');
  const resumeSub = useCustomerMutation(customerId, 'resume_subscription');
  const cancelSub = useCustomerMutation(customerId, 'cancel_subscription');

  const isPending =
    updatePrice.isPending ||
    pauseSub.isPending ||
    resumeSub.isPending ||
    cancelSub.isPending;

  const priceChanged = priceOre !== currentPriceOre && priceOre > 0;
  const numericPriceKr = priceChanged ? oreToSek(priceOre) : null;

  const { preview, loading: previewLoading, error: previewError } =
    useSubscriptionPricePreview({
      enabled: open && action === 'change_price' && priceChanged,
      customerId,
      newMonthlyPriceKr: numericPriceKr,
      currentPriceOre,
      mode: priceMode,
      debounceMs: 400,
    });

  const cancelMode: 'end_of_period' | 'immediate' | 'immediate_with_credit' | null =
    action === 'cancel_at_period_end'
      ? 'end_of_period'
      : action === 'cancel_now'
        ? 'immediate_with_credit'
        : null;

  const skippedInvoice = useMemo(() => {
    if (action !== 'pause') return null;
    if (!customer.next_invoice_date) return null;
    return {
      date: customer.next_invoice_date,
      amount_ore: currentPriceOre,
    };
  }, [action, customer.next_invoice_date, currentPriceOre]);

  const handleSave = async () => {
    try {
      if (action === 'change_price' && priceChanged) {
        await updatePrice.mutateAsync({
          monthly_price: oreToSek(priceOre),
          mode: priceMode,
        });
      } else if (action === 'cancel_at_period_end') {
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
      // Mutation hook handles toast/error rendering.
    }
  };

  const showConfirm = action === 'cancel_now';
  const onConfirmClick = () => {
    if (action === 'none') {
      toast.error('Välj en åtgärd att utföra.');
      return;
    }

    if (showConfirm) {
      setConfirmOpen(true);
      return;
    }

    void handleSave();
  };

  const isPaused = Boolean(customer.paused_until);
  const isCanceledAtEnd = Boolean(subscription?.cancel_at_period_end);

  if (!open) {
    return null;
  }

  return (
    <>
      <AdminFormDialog
        open={open}
        onClose={onClose}
        title="Hantera abonnemang"
        description={customer.business_name}
        size="lg"
        footer={
          <>
            <button
              onClick={onClose}
              className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-accent"
            >
              Avbryt
            </button>
            <button
              onClick={onConfirmClick}
              disabled={isPending || action === 'none'}
              className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
            >
              {isPending ? 'Sparar...' : 'Bekräfta åtgärd'}
            </button>
          </>
        }
      >
        <div className="space-y-5">
          <div className="grid grid-cols-3 gap-3 rounded-md border border-border bg-muted/30 p-3 text-xs">
            <KeyVal label="Månadspris" value={fmtKr(currentPriceOre)} />
            <KeyVal label="Nästa fakturering" value={fmtDate(customer.next_invoice_date)} />
            <KeyVal
              label="Status"
              value={
                isPaused
                  ? `Pausad t.o.m. ${customer.paused_until}`
                  : isCanceledAtEnd
                    ? 'Uppsagd vid periodslut'
                    : 'Aktiv'
              }
            />
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Åtgärd
            </label>
            <div className="grid gap-2">
              <ActionOption
                id="change_price"
                label="Ändra månadspris"
                description="Justera priset nu eller från och med nästa period."
                checked={action === 'change_price'}
                onChange={() => setAction('change_price')}
              />

              {!isCanceledAtEnd && !isPaused ? (
                <>
                  <ActionOption
                    id="cancel_at_period_end"
                    label="Avsluta vid periodslut"
                    description="Stoppar förnyelse. Kunden behåller tillgång perioden ut."
                    checked={action === 'cancel_at_period_end'}
                    onChange={() => setAction('cancel_at_period_end')}
                  />
                  <ActionOption
                    id="pause"
                    label="Planera paus"
                    description="Pausa debitering och CM-arbete till valt datum."
                    checked={action === 'pause'}
                    onChange={() => setAction('pause')}
                  />
                </>
              ) : null}

              {isCanceledAtEnd || isPaused ? (
                <ActionOption
                  id="resume"
                  label="Återaktivera / Häv paus"
                  description="Gör abonnemanget aktivt och löpande igen."
                  checked={action === 'resume'}
                  onChange={() => setAction('resume')}
                />
              ) : null}

              <ActionOption
                id="cancel_now"
                label="Avsluta omedelbart"
                description="Stänger av direkt med prorata-kreditering vid behov."
                checked={action === 'cancel_now'}
                onChange={() => setAction('cancel_now')}
                danger
              />
            </div>
          </div>

          {action === 'change_price' ? (
            <div className="space-y-3 rounded-md border border-border p-3">
              <AdminField label="Nytt månadspris">
                <PriceInput valueOre={priceOre} onChangeOre={setPriceOre} />
              </AdminField>

              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  När ska ändringen gälla?
                </label>
                <div className="flex gap-3">
                  <RadioInline
                    name="price-mode"
                    checked={priceMode === 'next_period'}
                    onChange={() => setPriceMode('next_period')}
                    label="Nästa faktureringsperiod"
                  />
                  <RadioInline
                    name="price-mode"
                    checked={priceMode === 'now'}
                    onChange={() => setPriceMode('now')}
                    label="Omedelbart (proration)"
                  />
                </div>
              </div>

              {previewError ? (
                <Alert color="red" icon={<Info className="h-4 w-4" />}>
                  {previewError}
                </Alert>
              ) : null}

              {previewLoading ? (
                <div className="space-y-2">
                  <Skeleton height={16} />
                  <Skeleton height={14} width="80%" />
                </div>
              ) : null}

              {preview && !previewLoading ? (
                <div className="rounded border border-border bg-muted/40 p-3 text-xs">
                  <div className="mb-2 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    <Receipt className="h-3 w-3" /> Stripe-förhandsgranskning
                  </div>
                  {preview.mode === 'next_period' ? (
                    <p>
                      Nytt pris <strong>{fmtKr(preview.new_price_ore)}/mån</strong> börjar gälla{' '}
                      <strong>{fmtDate(preview.effective_date)}</strong>. Ingen direkt
                      fakturering.
                    </p>
                  ) : (
                    <div className="space-y-1">
                      {preview.line_items.map((line) => (
                        <div key={line.id} className="flex justify-between gap-2">
                          <span className="line-clamp-1 text-muted-foreground">
                            {line.description}
                          </span>
                          <span className="tabular-nums">{fmtKr(line.amount_ore)}</span>
                        </div>
                      ))}
                      <div className="mt-1 flex justify-between border-t border-border pt-1 font-semibold">
                        <span>Faktureras nu</span>
                        <span
                          className={cn(
                            'tabular-nums',
                            preview.invoice_total_ore < 0
                              ? 'text-emerald-600'
                              : 'text-foreground',
                          )}
                        >
                          {fmtKr(preview.invoice_total_ore)}
                        </span>
                      </div>
                      {preview.invoice_total_ore < 0 ? (
                        <p className="text-[11px] text-muted-foreground">
                          Negativt belopp = kreditnota till kunden.
                        </p>
                      ) : null}
                    </div>
                  )}
                </div>
              ) : null}
            </div>
          ) : null}

          {cancelMode ? (
            <div className="space-y-2 rounded-md border border-border p-3">
              <CancelPreviewPanel customerId={customerId} mode={cancelMode} />
              {action === 'cancel_now' ? (
                <Alert color="red" icon={<Info className="h-4 w-4" />}>
                  Omedelbart avslut stänger tillgång direkt. Vid prorata-belopp ovan
                  föreslås en kreditnota.
                </Alert>
              ) : null}
            </div>
          ) : null}

          {action === 'pause' ? (
            <div className="space-y-3 rounded-md border border-border p-3">
              <AdminField label="Pausa till och med">
                <input
                  type="date"
                  min={todayDateInput()}
                  value={pauseUntil}
                  onChange={(event) => setPauseUntil(event.target.value)}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                />
              </AdminField>
              {skippedInvoice ? (
                <Alert color="blue" icon={<CalendarClock className="h-4 w-4" />}>
                  Nästa planerade faktura <strong>{fmtDate(skippedInvoice.date)}</strong> på{' '}
                  <strong>{fmtKr(skippedInvoice.amount_ore)}</strong> hoppas över.
                </Alert>
              ) : null}
            </div>
          ) : null}

          {action === 'resume' ? (
            <Alert color="green" icon={<Info className="h-4 w-4" />}>
              {isPaused
                ? 'Pausen hävs och kunden faktureras enligt schema igen.'
                : 'Schemalagt avslut tas bort och abonnemanget fortsätter löpande.'}
            </Alert>
          ) : null}
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

function KeyVal({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-sm font-medium text-foreground">{value}</p>
    </div>
  );
}

function RadioInline({
  name,
  checked,
  onChange,
  label,
}: {
  name: string;
  checked: boolean;
  onChange: () => void;
  label: string;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-1.5 text-sm text-foreground">
      <input
        type="radio"
        name={name}
        checked={checked}
        onChange={onChange}
        className="h-4 w-4 text-primary"
      />
      {label}
    </label>
  );
}

function ActionOption({
  id,
  label,
  description,
  checked,
  onChange,
  danger,
}: {
  id: string;
  label: string;
  description: string;
  checked: boolean;
  onChange: () => void;
  danger?: boolean;
}) {
  return (
    <label
      className={cn(
        'flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors',
        checked
          ? danger
            ? 'border-status-danger-fg bg-status-danger-bg/10'
            : 'border-primary bg-primary/5'
          : 'border-border hover:bg-accent',
      )}
    >
      <input
        id={id}
        type="radio"
        name="sub-action"
        checked={checked}
        onChange={onChange}
        className="mt-1 h-4 w-4 text-primary"
      />
      <div className="min-w-0 flex-1">
        <div
          className={cn(
            'text-sm font-semibold',
            danger && checked ? 'text-status-danger-fg' : 'text-foreground',
          )}
        >
          {label}
        </div>
        <div className="mt-0.5 text-[11px] leading-tight text-muted-foreground">
          {description}
        </div>
      </div>
    </label>
  );
}
