'use client';

import { useState } from 'react';
import type { CustomerDetail } from '@/hooks/admin/useCustomerDetail';
import type { OnboardingState, BlockingSignal } from '@/lib/admin-derive';
import { shortDateSv } from '@/lib/admin/time';
import { useCustomerRouteRefresh } from '@/hooks/admin/useAdminRefresh';
import { CustomerActionButton } from '@/components/admin/customers/routes/shared';

export default function AttentionPanel({
  customerId,
  customer,
  blocking,
  onboardingState,
  activeSnooze,
}: {
  customerId: string;
  customer: CustomerDetail;
  blocking: BlockingSignal;
  onboardingState: OnboardingState;
  activeSnooze: CustomerDetail['attention_snoozes'][number] | undefined;
}) {
  const refresh = useCustomerRouteRefresh(customerId);
  const [updatingAttention, setUpdatingAttention] = useState(false);
  const [attentionMessage, setAttentionMessage] = useState<string | null>(null);
  const [attentionError, setAttentionError] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<{
    label: string;
    description: string;
    run: () => Promise<void>;
  } | null>(null);

  const runAttentionSnooze = async (
    subjectType: 'onboarding' | 'customer_blocking',
    days: number | null,
  ) => {
    setUpdatingAttention(true);
    setAttentionError(null);
    setAttentionMessage(null);

    try {
      const response = await fetch(`/api/admin/attention/${subjectType}/${customer.id}/snooze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ days }),
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };

      if (!response.ok) {
        throw new Error(payload.error || 'Kunde inte markera som hanteras');
      }

      setAttentionMessage(
        days == null
          ? 'Markeringen ligger kvar tills vidare.'
          : `Markerad som hanteras i ${days} dagar.`,
      );
      await refresh();
    } catch (snoozeError) {
      setAttentionError(
        snoozeError instanceof Error ? snoozeError.message : 'Kunde inte markera som hanteras',
      );
    } finally {
      setUpdatingAttention(false);
    }
  };

  const clearAttentionSnooze = async (subjectType: 'onboarding' | 'customer_blocking') => {
    setUpdatingAttention(true);
    setAttentionError(null);
    setAttentionMessage(null);

    try {
      const response = await fetch(`/api/admin/attention/${subjectType}/${customer.id}/snooze`, {
        method: 'DELETE',
        credentials: 'include',
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };

      if (!response.ok) {
        throw new Error(payload.error || 'Kunde inte ta bort hanteras-markering');
      }

      setAttentionMessage('Hanteras-markeringen togs bort.');
      await refresh();
    } catch (clearError) {
      setAttentionError(
        clearError instanceof Error ? clearError.message : 'Kunde inte ta bort hanteras-markering',
      );
    } finally {
      setUpdatingAttention(false);
    }
  };

  const setPlannedPause = async (days: number | null) => {
    setUpdatingAttention(true);
    setAttentionError(null);
    setAttentionMessage(null);

    try {
      const pausedUntil =
        days == null
          ? null
          : new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

      const response = await fetch(`/api/admin/customers/${customer.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ paused_until: pausedUntil }),
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };

      if (!response.ok) {
        throw new Error(payload.error || 'Kunde inte satta planerad paus');
      }

      setAttentionMessage(
        pausedUntil ? `Planerad paus satt till ${shortDateSv(pausedUntil)}.` : 'Planerad paus borttagen.',
      );
      await refresh();
    } catch (pauseError) {
      setAttentionError(
        pauseError instanceof Error ? pauseError.message : 'Kunde inte satta planerad paus',
      );
    } finally {
      setUpdatingAttention(false);
    }
  };

  return (
    <div className="space-y-3">
      {activeSnooze ? (
        <div className="rounded-md border border-info/30 bg-info/5 px-3 py-3 text-xs text-info">
          <div className="font-semibold">
            Hanteras {activeSnooze.snoozed_until ? `till ${shortDateSv(activeSnooze.snoozed_until)}` : 'utan sluttid'}
          </div>
          {activeSnooze.note ? <div className="mt-1">{activeSnooze.note}</div> : null}
          <button
            type="button"
            onClick={() => void clearAttentionSnooze(activeSnooze.subject_type)}
            disabled={updatingAttention}
            className="mt-2 text-xs font-semibold text-info hover:opacity-80 disabled:opacity-50"
          >
            Ta bort hanteras-markering
          </button>
        </div>
      ) : null}

      {attentionMessage ? (
        <div className="rounded-md border border-success/30 bg-success/5 px-3 py-2 text-xs text-success">
          {attentionMessage}
        </div>
      ) : null}
      {attentionError ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          {attentionError}
        </div>
      ) : null}

      <div className="space-y-2">
        {blocking.state !== 'none' ? (
          <>
            <CustomerActionButton
              onClick={() =>
                setConfirmAction({
                  label: 'Markera blockerad kund i 3 dagar',
                  description:
                    'Kunden markeras som hanterad i tre dagar och lyfts bort ur attention-flodet under tiden.',
                  run: () => runAttentionSnooze('customer_blocking', 3),
                })
              }
              disabled={updatingAttention}
            >
              Markera blockerad kund som hanteras i 3 dagar
            </CustomerActionButton>
            <CustomerActionButton
              onClick={() =>
                setConfirmAction({
                  label: 'Markera blockerad kund i 7 dagar',
                  description:
                    'Kunden markeras som hanterad i sju dagar och visas igen nar snoozen lopar ut.',
                  run: () => runAttentionSnooze('customer_blocking', 7),
                })
              }
              disabled={updatingAttention}
            >
              Markera blockerad kund som hanteras i 7 dagar
            </CustomerActionButton>
            <CustomerActionButton
              onClick={() =>
                setConfirmAction({
                  label: 'Satt planerad paus i 7 dagar',
                  description:
                    'Detta lagger en planerad paus pa kunden i sju dagar och andrar den operativa signaleringen.',
                  run: () => setPlannedPause(7),
                })
              }
              disabled={updatingAttention}
            >
              Satt planerad paus i 7 dagar
            </CustomerActionButton>
            {customer.paused_until ? (
              <CustomerActionButton
                onClick={() =>
                  setConfirmAction({
                    label: 'Ta bort planerad paus',
                    description:
                      'Den planerade pausen tas bort och kunden atergar till ordinarie operativ status.',
                    run: () => setPlannedPause(null),
                  })
                }
                disabled={updatingAttention}
              >
                Ta bort planerad paus
              </CustomerActionButton>
            ) : null}
          </>
        ) : null}
        {onboardingState === 'cm_ready' ? (
          <CustomerActionButton
            onClick={() =>
              setConfirmAction({
                label: 'Markera onboarding i 3 dagar',
                description:
                  'Onboarding flaggas som hanterad i tre dagar for att minska brus i attention-vyn.',
                run: () => runAttentionSnooze('onboarding', 3),
              })
            }
            disabled={updatingAttention}
          >
            Markera onboarding som hanteras i 3 dagar
          </CustomerActionButton>
        ) : null}
      </div>

      {confirmAction ? (
        <div className="rounded-md border border-border bg-secondary/20 p-3">
          <div className="text-sm font-semibold text-foreground">{confirmAction.label}</div>
          <div className="mt-1 text-xs text-muted-foreground">{confirmAction.description}</div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void confirmAction.run().finally(() => setConfirmAction(null))}
              disabled={updatingAttention}
              className="rounded-md bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-50"
            >
              {updatingAttention ? 'Arbetar...' : 'Bekrafta'}
            </button>
            <button
              type="button"
              onClick={() => setConfirmAction(null)}
              disabled={updatingAttention}
              className="rounded-md border border-border px-3 py-2 text-xs font-semibold text-foreground disabled:opacity-50"
            >
              Avbryt
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
