'use client';

import { useMemo, useState } from 'react';
import ConfirmActionDialog from '@/components/admin/ConfirmActionDialog';
import { CancelPreviewPanel } from '@/components/admin/billing/subscriptions/CancelPreviewPanel';
import { SubscriptionLifecycleSummary } from '@/components/admin/billing/subscriptions/SubscriptionLifecycleSummary';
import type { CustomerDetail } from '@/hooks/admin/useCustomerDetail';
import { useCustomerInvoices } from '@/hooks/admin/useCustomerInvoices';
import { useCustomerMutation } from '@/hooks/admin/useCustomerMutation';
import { useCustomerSubscription } from '@/hooks/admin/useCustomerSubscription';
import { formatPriceSEK, formatSek, sekToOre } from '@/lib/admin/money';
import { shortDateSv, todayDateInput } from '@/lib/admin/time';

export default function SubscriptionActions({
  customerId,
  customer,
  onChanged,
  variant = 'all',
}: {
  customerId: string;
  customer: CustomerDetail;
  onChanged: () => void;
  variant?: 'all' | 'safe' | 'danger';
}) {
  const [pauseUntil, setPauseUntil] = useState(customer.paused_until ?? '');
  const [cancelMode, setCancelMode] = useState<
    'end_of_period' | 'immediate' | 'immediate_with_credit'
  >('end_of_period');
  const [creditAmountSek, setCreditAmountSek] = useState('');
  const [cancelMemo, setCancelMemo] = useState('');
  const [creditSettlementMode, setCreditSettlementMode] = useState<
    'refund' | 'customer_balance' | 'outside_stripe'
  >('refund');
  const [confirmAction, setConfirmAction] = useState<'cancel' | 'archive' | null>(null);

  const reactivateArchiveMutation = useCustomerMutation(customerId, 'reactivate_archive', {
    onSuccess: () => onChanged(),
  });
  const pauseSubscriptionMutation = useCustomerMutation(customerId, 'pause_subscription', {
    onSuccess: () => onChanged(),
  });
  const resumeSubscriptionMutation = useCustomerMutation(customerId, 'resume_subscription', {
    onSuccess: () => onChanged(),
  });
  const cancelSubscriptionMutation = useCustomerMutation(customerId, 'cancel_subscription', {
    onSuccess: () => {
      setConfirmAction(null);
      onChanged();
    },
  });
  const archiveCustomerMutation = useCustomerMutation(customerId, 'archive_customer', {
    onSuccess: () => {
      setConfirmAction(null);
      onChanged();
    },
  });

  const { data: subscription } = useCustomerSubscription(customerId);
  const { data: invoicesData = { invoices: [], operations: [] } } = useCustomerInvoices(customerId);
  const { invoices } = invoicesData;

  const latestPaidInvoice = useMemo(
    () => invoices.find((invoice) => invoice.status === 'paid') ?? null,
    [invoices],
  );
  const parsedCreditAmountSek = Number(creditAmountSek || 0);
  const creditAmountOre = Number.isFinite(parsedCreditAmountSek)
    ? sekToOre(parsedCreditAmountSek)
    : null;

  const pending =
    reactivateArchiveMutation.isPending
      ? 'reactivate_archive'
      : pauseSubscriptionMutation.isPending
        ? 'pause_subscription'
        : resumeSubscriptionMutation.isPending
          ? 'resume_subscription'
          : cancelSubscriptionMutation.isPending
            ? 'cancel_subscription'
            : archiveCustomerMutation.isPending
              ? 'archive'
              : null;

  const activeError = [
    reactivateArchiveMutation.error,
    pauseSubscriptionMutation.error,
    resumeSubscriptionMutation.error,
    cancelSubscriptionMutation.error,
    archiveCustomerMutation.error,
  ].find(Boolean);
  const error = activeError instanceof Error ? activeError.message : null;

  const cancelActionDisabled =
    pending !== null ||
    (cancelMode === 'immediate_with_credit' &&
      (!latestPaidInvoice || creditAmountOre == null || creditAmountOre <= 0));

  const settlementLabel =
    creditSettlementMode === 'refund'
      ? 'återbetalas till betalkortet'
      : creditSettlementMode === 'customer_balance'
        ? 'läggs som kundsaldo (dras nästa faktura)'
        : 'hanteras manuellt utanför Stripe';

  const cancelConfirmDescription =
    cancelMode === 'end_of_period'
      ? 'Abonnemanget fortsätter fram till periodslut och stoppas sedan. Ingen kreditnota skapas.'
      : cancelMode === 'immediate'
        ? 'Abonnemanget stoppas omedelbart utan kreditnota eller refund.'
        : latestPaidInvoice
          ? `Abonnemanget stoppas omedelbart. En kreditnota på ${formatPriceSEK(parsedCreditAmountSek, { fallback: '0 kr' })} skapas mot senaste betalda fakturan och beloppet ${settlementLabel}.`
          : 'Det finns ingen betald faktura att kreditera mot. Den här åtgärden kommer att misslyckas.';

  const showSafe = variant === 'all' || variant === 'safe';
  const showDanger = variant === 'all' || variant === 'danger';

  return (
    <>
      <div className="space-y-3">
        {showSafe && customer.status === 'archived' ? (
          <ActionButton
            onClick={() => void reactivateArchiveMutation.mutateAsync({}).catch(() => {})}
            disabled={pending !== null}
          >
            {pending === 'reactivate_archive'
              ? 'Återaktiverar...'
              : 'Återaktivera befintlig kundprofil'}
          </ActionButton>
        ) : null}

        {showSafe && subscription ? (
          <SubscriptionLifecycleSummary
            status={subscription.status}
            cancelAtPeriodEnd={subscription.cancel_at_period_end}
            currentPeriodStart={subscription.current_period_start ?? null}
            currentPeriodEnd={subscription.current_period_end ?? null}
            pausedUntil={customer.paused_until ?? null}
            monthlyPriceOre={
              (customer as { monthly_price_ore?: number | null }).monthly_price_ore ?? null
            }
          />
        ) : null}

        {showSafe &&
        subscription &&
        subscription.status === 'active' &&
        !subscription.cancel_at_period_end ? (
          <div className="rounded-md border border-border p-3">
            <div className="mb-2 text-sm font-semibold text-foreground">Pausa abonnemang</div>
            <div className="mb-2 text-xs text-muted-foreground">
              Sätt ett slutdatum så att abonnemanget återupptas automatiskt.
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                type="date"
                value={pauseUntil}
                min={todayDateInput()}
                onChange={(event) => setPauseUntil(event.target.value)}
                className="rounded-md border border-border bg-background px-3 py-2 text-sm"
              />
              <ActionButton
                onClick={() =>
                  void pauseSubscriptionMutation
                    .mutateAsync({
                      pause_until: pauseUntil || null,
                    })
                    .catch(() => {})
                }
                disabled={pending !== null || !pauseUntil}
              >
                {pending === 'pause_subscription' ? 'Pausar...' : 'Pausa till valt datum'}
              </ActionButton>
            </div>
          </div>
        ) : null}

        {showSafe &&
        subscription &&
        (subscription.status === 'paused' || subscription.cancel_at_period_end) ? (
          <ActionButton
            onClick={() => void resumeSubscriptionMutation.mutateAsync({}).catch(() => {})}
            disabled={pending !== null}
          >
            {pending === 'resume_subscription'
              ? 'Återupptar...'
              : subscription.cancel_at_period_end
                ? 'Ångra uppsägning'
                : 'Återuppta abonnemang'}
          </ActionButton>
        ) : null}

        {showDanger &&
        subscription &&
        subscription.status !== 'canceled' &&
        subscription.status !== 'cancelled' &&
        !subscription.cancel_at_period_end ? (
          <div className="rounded-md border border-destructive/20 p-3">
            <div className="mb-2 text-sm font-semibold text-foreground">Avsluta abonnemang</div>
            <div className="space-y-2">
              <ModeRow
                active={cancelMode === 'end_of_period'}
                onClick={() => setCancelMode('end_of_period')}
                title="Vid periodslut"
                description="Tjänsten fortsätter perioden ut och stängs sedan."
              />
              <ModeRow
                active={cancelMode === 'immediate'}
                onClick={() => setCancelMode('immediate')}
                title="Direkt utan kredit"
                description="Abonnemanget avslutas nu utan refund eller credit note."
              />
              <ModeRow
                active={cancelMode === 'immediate_with_credit'}
                onClick={() => setCancelMode('immediate_with_credit')}
                title="Direkt med kredit"
                description="Avslutar nu och skapar kreditnota mot senaste betalda fakturan."
              />
            </div>

            {cancelMode === 'immediate_with_credit' ? (
              <div className="mt-3 space-y-2 rounded-md border border-border bg-secondary/30 p-3">
                <div className="text-xs text-muted-foreground">
                  {latestPaidInvoice
                    ? `Senaste betalda faktura: ${formatSek(latestPaidInvoice.amount_due ?? 0)} från ${shortDateSv(latestPaidInvoice.created_at)}`
                    : 'Ingen betald faktura hittades. Valt läge kommer att misslyckas utan underlag för kreditering.'}
                </div>
                <input
                  value={creditAmountSek}
                  onChange={(event) => setCreditAmountSek(event.target.value)}
                  inputMode="decimal"
                  placeholder="Belopp i SEK"
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                />
                <label className="block text-xs text-muted-foreground">
                  Kreditering hanteras som
                  <select
                    value={creditSettlementMode}
                    onChange={(event) =>
                      setCreditSettlementMode(
                        event.target.value as
                          | 'refund'
                          | 'customer_balance'
                          | 'outside_stripe',
                      )
                    }
                    className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                  >
                    <option value="refund">Återbetala till betalkort</option>
                    <option value="customer_balance">Kundsaldo (dras på nästa faktura)</option>
                    <option value="outside_stripe">Hanteras utanför Stripe (manuellt)</option>
                  </select>
                </label>
                <textarea
                  value={cancelMemo}
                  onChange={(event) => setCancelMemo(event.target.value)}
                  rows={3}
                  placeholder="Intern notering till credit note"
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                />
              </div>
            ) : null}

            {(cancelMode === 'immediate' || cancelMode === 'immediate_with_credit') && (
              <div className="mt-3">
                <CancelPreviewPanel customerId={customerId} mode={cancelMode} />
              </div>
            )}

            <div className="mt-3">
              <ActionButton
                onClick={() => setConfirmAction('cancel')}
                disabled={cancelActionDisabled}
                tone="danger"
              >
                {pending === 'cancel_subscription'
                  ? 'Avslutar...'
                  : cancelMode === 'end_of_period'
                    ? 'Schemalägg uppsägning'
                    : cancelMode === 'immediate'
                      ? 'Avsluta direkt'
                      : 'Avsluta direkt och kreditera'}
              </ActionButton>
            </div>
          </div>
        ) : null}

        {showDanger && customer.status !== 'archived' ? (
          <ActionButton
            onClick={() => setConfirmAction('archive')}
            disabled={pending !== null}
            tone="danger"
          >
            {pending === 'archive' ? 'Arkiverar...' : 'Arkivera kund'}
          </ActionButton>
        ) : null}

        {error ? (
          <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
            {error}
          </div>
        ) : null}
      </div>

      <ConfirmActionDialog
        open={confirmAction === 'cancel'}
        onOpenChange={(open) => setConfirmAction(open ? 'cancel' : null)}
        title="Avsluta abonnemang?"
        description={cancelConfirmDescription}
        confirmLabel={
          cancelMode === 'end_of_period'
            ? 'Bekräfta uppsägning'
            : cancelMode === 'immediate'
              ? 'Avsluta direkt'
              : 'Avsluta och kreditera'
        }
        onConfirm={() =>
          void cancelSubscriptionMutation
            .mutateAsync({
              mode: cancelMode,
              // Skicka stripe_invoice_id (inte vår interna UUID) så backend
              // kan slå upp den robust i mirror-tabellen.
              invoice_id:
                latestPaidInvoice?.stripe_invoice_id ?? latestPaidInvoice?.id ?? null,
              credit_amount_ore:
                cancelMode === 'immediate_with_credit' ? creditAmountOre : null,
              credit_settlement_mode:
                cancelMode === 'immediate_with_credit' ? creditSettlementMode : null,
              memo: cancelMemo || null,
            })
            .catch(() => {})
        }
        pending={pending === 'cancel_subscription'}
      />

      <ConfirmActionDialog
        open={confirmAction === 'archive'}
        onOpenChange={(open) => setConfirmAction(open ? 'archive' : null)}
        title="Arkivera kund?"
        description="Kundprofilen markeras som arkiverad och tillhörande Stripe-resurser städas enligt arkiveringsflödet."
        confirmLabel="Arkivera kund"
        onConfirm={() => void archiveCustomerMutation.mutateAsync(undefined).catch(() => {})}
        pending={pending === 'archive'}
      />
    </>
  );
}

function statusLabel(status: string, cancelAtPeriodEnd: boolean) {
  if (cancelAtPeriodEnd) return 'Avslutas vid periodens slut';
  if (status === 'paused') return 'Pausad';
  if (status === 'active') return 'Aktiv';
  if (status === 'past_due') return 'Förfallen';
  if (status === 'trialing') return 'Trial';
  if (status === 'canceled' || status === 'cancelled') return 'Avslutad';
  return status || 'Okänd';
}

function ModeRow({
  active,
  onClick,
  title,
  description,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  description: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full rounded-md border px-3 py-3 text-left ${
        active ? 'border-primary bg-primary/5' : 'border-border bg-background'
      }`}
    >
      <div className="text-sm font-semibold text-foreground">{title}</div>
      <div className="mt-1 text-xs text-muted-foreground">{description}</div>
    </button>
  );
}

function ActionButton({
  children,
  onClick,
  disabled,
  tone = 'default',
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  tone?: 'default' | 'danger';
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`w-full rounded-md border px-4 py-2.5 text-left text-sm font-semibold disabled:opacity-50 ${
        tone === 'danger'
          ? 'border-destructive text-destructive'
          : 'border-border text-foreground'
      }`}
    >
      {children}
    </button>
  );
}
