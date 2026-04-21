'use client';

import { useMemo, useState } from 'react';
import ConfirmActionDialog from '@/components/admin/ConfirmActionDialog';
import {
  archiveCustomer,
  callCustomerAction,
} from '@/lib/admin/api-client';
import type { CustomerAction } from '@/lib/admin/schemas/customer-actions';
import {
  useCustomerInvoices,
  useCustomerSubscription,
  type CustomerDetail,
} from '@/hooks/admin/useCustomerDetail';
import { formatSek } from '@/lib/admin/money';
import { shortDateSv } from '@/lib/admin/time';

export default function SubscriptionActions({
  customerId,
  customer,
  onChanged,
}: {
  customerId: string;
  customer: CustomerDetail;
  onChanged: () => void;
}) {
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pauseUntil, setPauseUntil] = useState(customer.paused_until ?? '');
  const [cancelMode, setCancelMode] = useState<'end_of_period' | 'immediate' | 'immediate_with_credit'>('end_of_period');
  const [creditAmountSek, setCreditAmountSek] = useState('');
  const [cancelMemo, setCancelMemo] = useState('');
  const [confirmAction, setConfirmAction] = useState<'cancel' | 'archive' | null>(null);
  const { data: subscription } = useCustomerSubscription(
    customerId,
    customer.stripe_subscription_id,
  );
  const { data: invoices = [] } = useCustomerInvoices(customerId);

  const latestPaidInvoice = useMemo(
    () => invoices.find((invoice) => invoice.status === 'paid') ?? null,
    [invoices],
  );

  const run = async (
    body: CustomerAction | null,
    method: 'PATCH' | 'DELETE' = 'PATCH',
  ) => {
    setPending(body?.action ?? (method === 'DELETE' ? 'archive' : method));
    setError(null);

    try {
      let result;
      if (method === 'DELETE') {
        result = await archiveCustomer(customerId);
      } else if (body) {
        result = await callCustomerAction(customerId, body);
      } else {
        throw new Error('Saknar action-payload');
      }

      if (!result.ok) {
        throw new Error(result.error || 'Misslyckades');
      }

      setConfirmAction(null);
      onChanged();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Misslyckades');
    } finally {
      setPending(null);
    }
  };

  const cancelActionDisabled =
    pending !== null ||
    (cancelMode === 'immediate_with_credit' &&
      (!latestPaidInvoice || !Number.isFinite(Number(creditAmountSek)) || Number(creditAmountSek) <= 0));

  const cancelConfirmDescription =
    cancelMode === 'end_of_period'
      ? 'Abonnemanget fortsatter fram till periodslut och stoppas sedan. Ingen kreditnota skapas.'
      : cancelMode === 'immediate'
        ? 'Abonnemanget stoppas omedelbart utan kreditnota eller refund.'
        : latestPaidInvoice
          ? `Abonnemanget stoppas omedelbart och en kreditnota skapas mot senaste betalda fakturan pa ${formatSek(Math.round(Number(creditAmountSek || 0) * 100))}.`
          : 'Det finns ingen betald faktura att kreditera mot. Den har atgarden kommer att misslyckas.';

  return (
    <>
      <div className="space-y-3">
        {customer.status === 'archived' ? (
          <ActionButton
            onClick={() => void run({ action: 'reactivate_archive' })}
            disabled={pending !== null}
          >
            {pending === 'reactivate_archive'
              ? 'Ateraktiverar...'
              : 'Ateraktivera befintlig kundprofil'}
          </ActionButton>
        ) : null}

        {subscription ? (
          <div className="rounded-md border border-border bg-secondary/40 px-3 py-2 text-xs text-muted-foreground">
            <div className="font-semibold text-foreground">
              Status: {statusLabel(subscription.status, subscription.cancel_at_period_end)}
            </div>
            {subscription.current_period_end ? (
              <div>Nuvarande period slutar {shortDateSv(subscription.current_period_end)}</div>
            ) : null}
            {customer.paused_until ? (
              <div>Autoresume planerad till {shortDateSv(customer.paused_until)}</div>
            ) : null}
          </div>
        ) : null}

        {subscription &&
        subscription.status === 'active' &&
        !subscription.cancel_at_period_end ? (
          <div className="rounded-md border border-border p-3">
            <div className="mb-2 text-sm font-semibold text-foreground">Pausa abonnemang</div>
            <div className="mb-2 text-xs text-muted-foreground">
              Satt ett slutdatum sa att abonnemanget aterupptas automatiskt.
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                type="date"
                value={pauseUntil}
                min={new Date().toISOString().slice(0, 10)}
                onChange={(event) => setPauseUntil(event.target.value)}
                className="rounded-md border border-border bg-background px-3 py-2 text-sm"
              />
              <ActionButton
                onClick={() =>
                  void run({
                    action: 'pause_subscription',
                    pause_until: pauseUntil || null,
                  })
                }
                disabled={pending !== null || !pauseUntil}
              >
                {pending === 'pause_subscription' ? 'Pausar...' : 'Pausa till valt datum'}
              </ActionButton>
            </div>
          </div>
        ) : null}

        {subscription &&
        (subscription.status === 'paused' || subscription.cancel_at_period_end) ? (
          <ActionButton
            onClick={() => void run({ action: 'resume_subscription' })}
            disabled={pending !== null}
          >
            {pending === 'resume_subscription'
              ? 'Aterupptar...'
              : subscription.cancel_at_period_end
                ? 'Angra uppsagning'
                : 'Ateruppta abonnemang'}
          </ActionButton>
        ) : null}

        {subscription &&
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
                description="Tjansten fortsatter perioden ut och stangs sedan."
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
                    ? `Senaste betalda faktura: ${formatSek(latestPaidInvoice.amount_due ?? 0)} fran ${shortDateSv(latestPaidInvoice.created_at)}`
                    : 'Ingen betald faktura hittades. Valt lage kommer att misslyckas utan underlag for kreditering.'}
                </div>
                <input
                  value={creditAmountSek}
                  onChange={(event) => setCreditAmountSek(event.target.value)}
                  inputMode="decimal"
                  placeholder="Belopp i SEK"
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                />
                <textarea
                  value={cancelMemo}
                  onChange={(event) => setCancelMemo(event.target.value)}
                  rows={3}
                  placeholder="Intern notering till credit note"
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                />
              </div>
            ) : null}

            <div className="mt-3">
              <ActionButton
                onClick={() => setConfirmAction('cancel')}
                disabled={cancelActionDisabled}
                tone="danger"
              >
                {pending === 'cancel_subscription'
                  ? 'Avslutar...'
                  : cancelMode === 'end_of_period'
                    ? 'Schemalagg uppsagning'
                    : cancelMode === 'immediate'
                      ? 'Avsluta direkt'
                      : 'Avsluta direkt och kreditera'}
              </ActionButton>
            </div>
          </div>
        ) : null}

        {customer.status !== 'archived' ? (
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
            ? 'Bekrafta uppsagning'
            : cancelMode === 'immediate'
              ? 'Avsluta direkt'
              : 'Avsluta och kreditera'
        }
        onConfirm={() =>
          void run({
            action: 'cancel_subscription',
            mode: cancelMode,
            invoice_id: latestPaidInvoice?.id ?? null,
            credit_amount_ore:
              cancelMode === 'immediate_with_credit'
                ? Math.round(Number(creditAmountSek || 0) * 100)
                : null,
            memo: cancelMemo || null,
          })
        }
        pending={pending === 'cancel_subscription'}
      />

      <ConfirmActionDialog
        open={confirmAction === 'archive'}
        onOpenChange={(open) => setConfirmAction(open ? 'archive' : null)}
        title="Arkivera kund?"
        description="Kundprofilen markeras som arkiverad och tillhorande Stripe-resurser stadas enligt arkiveringsflodet."
        confirmLabel="Arkivera kund"
        onConfirm={() => void run(null, 'DELETE')}
        pending={pending === 'archive'}
      />
    </>
  );
}

function statusLabel(status: string, cancelAtPeriodEnd: boolean) {
  if (cancelAtPeriodEnd) return 'Avslutas vid periodens slut';
  if (status === 'paused') return 'Pausad';
  if (status === 'active') return 'Aktiv';
  if (status === 'past_due') return 'Forfallen';
  if (status === 'trialing') return 'Trial';
  if (status === 'canceled' || status === 'cancelled') return 'Avslutad';
  return status || 'Okand';
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
