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
            <CustomerActionButton onClick={() => void runAttentionSnooze('customer_blocking', 3)} disabled={updatingAttention}>
              Markera blockerad kund som hanteras i 3 dagar
            </CustomerActionButton>
            <CustomerActionButton onClick={() => void runAttentionSnooze('customer_blocking', 7)} disabled={updatingAttention}>
              Markera blockerad kund som hanteras i 7 dagar
            </CustomerActionButton>
            <CustomerActionButton onClick={() => void setPlannedPause(7)} disabled={updatingAttention}>
              Satt planerad paus i 7 dagar
            </CustomerActionButton>
            {customer.paused_until ? (
              <CustomerActionButton onClick={() => void setPlannedPause(null)} disabled={updatingAttention}>
                Ta bort planerad paus
              </CustomerActionButton>
            ) : null}
          </>
        ) : null}
        {onboardingState === 'cm_ready' ? (
          <CustomerActionButton onClick={() => void runAttentionSnooze('onboarding', 3)} disabled={updatingAttention}>
            Markera onboarding som hanteras i 3 dagar
          </CustomerActionButton>
        ) : null}
      </div>
    </div>
  );
}
