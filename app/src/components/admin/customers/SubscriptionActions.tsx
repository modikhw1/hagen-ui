'use client';

import { useState } from 'react';
import {
  useCustomerSubscription,
  type CustomerDetail,
} from '@/hooks/admin/useCustomerDetail';
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
  const { data: subscription } = useCustomerSubscription(
    customerId,
    customer.stripe_subscription_id
  );

  const run = async (action: string, method: 'PATCH' | 'DELETE' = 'PATCH') => {
    setPending(action);
    setError(null);

    try {
      const res = await fetch(`/api/admin/customers/${customerId}`, {
        method,
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: method === 'PATCH' ? JSON.stringify({ action }) : undefined,
      });

      if (!res.ok) {
        const payload = await res.json();
        throw new Error(payload.error || 'Misslyckades');
      }

      onChanged();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Misslyckades');
    } finally {
      setPending(null);
    }
  };

  return (
    <>
      {subscription ? (
        <div className="mb-2 rounded-md border border-border bg-secondary/40 px-3 py-2 text-xs text-muted-foreground">
          <div className="font-semibold text-foreground">
            Status: {statusLabel(subscription.status, subscription.cancel_at_period_end)}
          </div>
          {subscription.current_period_end ? (
            <div>Nuvarande period slutar {shortDateSv(subscription.current_period_end)}</div>
          ) : null}
        </div>
      ) : null}

      {subscription &&
      subscription.status === 'active' &&
      !subscription.cancel_at_period_end && (
        <ActionButton
          onClick={() => void run('pause_subscription')}
          disabled={pending !== null}
        >
          {pending === 'pause_subscription' ? 'Pausar...' : 'Pausa abonnemang'}
        </ActionButton>
      )}

      {subscription &&
      (subscription.status === 'paused' || subscription.cancel_at_period_end) && (
        <ActionButton
          onClick={() => void run('resume_subscription')}
          disabled={pending !== null}
        >
          {pending === 'resume_subscription'
            ? 'Återupptar...'
            : subscription.cancel_at_period_end
              ? 'Ångra uppsägning'
              : 'Återuppta abonnemang'}
        </ActionButton>
      )}

      {subscription &&
      subscription.status !== 'canceled' &&
      subscription.status !== 'cancelled' &&
      !subscription.cancel_at_period_end && (
        <ActionButton
          onClick={() => void run('cancel_subscription')}
          disabled={pending !== null}
          tone="danger"
        >
          {pending === 'cancel_subscription'
            ? 'Avslutar...'
            : 'Avsluta abonnemang'}
        </ActionButton>
      )}

      <ActionButton
        onClick={() => void run('archive', 'DELETE')}
        disabled={pending !== null}
        tone="danger"
      >
        {pending === 'archive' ? 'Arkiverar...' : 'Arkivera kund'}
      </ActionButton>

      {error && (
        <div className="mt-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          {error}
        </div>
      )}
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
