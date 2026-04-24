'use client';

import { useState } from 'react';
import type { CustomerDetail } from '@/hooks/admin/useCustomerDetail';
import type { OnboardingState, BlockingSignal } from '@/lib/admin-derive';
import { apiClient } from '@/lib/admin/api-client';
import { shortDateSv } from '@/lib/admin/time';
import { useCustomerRouteRefresh } from '@/hooks/admin/useAdminRefresh';
import { CustomerActionButton } from '@/components/admin/customers/routes/shared';
import ConfirmActionDialog from '@/components/admin/ConfirmActionDialog';
import { toast } from 'sonner';

type ClearableSnooze = {
  subject_type: 'onboarding' | 'customer_blocking';
  subject_id: string;
  snoozed_until: string | null;
  released_at: string | null;
  note: string | null;
};

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
  const clearableSnooze: ClearableSnooze | null =
    activeSnooze &&
    (activeSnooze.subject_type === 'onboarding' || activeSnooze.subject_type === 'customer_blocking')
      ? (activeSnooze as ClearableSnooze)
      : null;
  
  const [updating, setUpdating] = useState(false);
  const [confirmAction, setConfirmAction] = useState<{
    label: string;
    description: string;
    run: () => Promise<void>;
  } | null>(null);

  const runAttentionSnooze = async (subjectType: 'onboarding' | 'customer_blocking', days: number | null) => {
    setUpdating(true);
    try {
      await apiClient.post(`/api/admin/attention/${subjectType}/${customer.id}/snooze`, { days });
      toast.success(days ? `Markerad som hanteras i ${days} dagar` : 'Markerad tills vidare');
      await refresh();
    } catch (e) {
      toast.error('Kunde inte markera som hanteras');
    } finally {
      setUpdating(false);
      setConfirmAction(null);
    }
  };

  const clearAttentionSnooze = async (subjectType: 'onboarding' | 'customer_blocking') => {
    setUpdating(true);
    try {
      await apiClient.del(`/api/admin/attention/${subjectType}/${customer.id}/snooze`);
      toast.success('Hanteras-markeringen borttagen');
      await refresh();
    } catch (e) {
      toast.error('Kunde inte ta bort markering');
    } finally {
      setUpdating(false);
    }
  };

  const setPlannedPause = async (days: number | null) => {
    setUpdating(true);
    try {
      const pausedUntil = days == null ? null : new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      await apiClient.patch(`/api/admin/customers/${customer.id}`, { paused_until: pausedUntil });
      toast.success(pausedUntil ? `Planerad paus till ${shortDateSv(pausedUntil)}` : 'Paus borttagen');
      await refresh();
    } catch (e) {
      toast.error('Kunde inte uppdatera paus');
    } finally {
      setUpdating(false);
      setConfirmAction(null);
    }
  };

  return (
    <div className="space-y-4 pt-2">
      {clearableSnooze ? (
        <div className="rounded-lg border border-status-info-fg/20 bg-status-info-bg px-4 py-3 text-sm text-status-info-fg shadow-sm">
          <div className="font-bold flex items-center justify-between">
            <span>Markerad som hanteras</span>
            <button
              onClick={() => void clearAttentionSnooze(clearableSnooze.subject_type)}
              disabled={updating}
              className="text-xs underline hover:no-underline"
            >
              Släpp nu
            </button>
          </div>
          <div className="mt-1 text-xs opacity-90">
            {clearableSnooze.snoozed_until ? `Gäller t.o.m. ${shortDateSv(clearableSnooze.snoozed_until)}` : 'Gäller tills vidare'}
          </div>
        </div>
      ) : null}

      <div className="grid gap-2 sm:grid-cols-2">
        {blocking.state !== 'none' && !clearableSnooze && (
          <>
            <button
              onClick={() => setConfirmAction({
                label: 'Markera som hanteras i 3 dagar',
                description: 'Kunden lyfts bort ur attention-listan tillfälligt.',
                run: () => runAttentionSnooze('customer_blocking', 3),
              })}
              disabled={updating}
              className="rounded-md border border-border bg-background px-3 py-2 text-left text-xs font-semibold hover:bg-accent transition-colors"
            >
              Hanteras (3d)
            </button>
            <button
              onClick={() => setConfirmAction({
                label: 'Planera paus i 7 dagar',
                description: 'Kunden får en planerad paus i sju dagar.',
                run: () => setPlannedPause(7),
              })}
              disabled={updating}
              className="rounded-md border border-border bg-background px-3 py-2 text-left text-xs font-semibold hover:bg-accent transition-colors"
            >
              Pausa (7d)
            </button>
          </>
        )}
        
        {onboardingState === 'cm_ready' && !clearableSnooze && (
          <button
            onClick={() => setConfirmAction({
              label: 'Markera onboarding som hanteras',
              description: 'Döljer onboarding-alert i 3 dagar.',
              run: () => runAttentionSnooze('onboarding', 3),
            })}
            disabled={updating}
            className="col-span-2 rounded-md border border-border bg-background px-3 py-2 text-left text-xs font-semibold hover:bg-accent transition-colors"
          >
            Hanteras (3d)
          </button>
        )}

        {customer.paused_until && (
          <button
            onClick={() => setConfirmAction({
              label: 'Ta bort planerad paus',
              description: 'Kunden återgår till normal drift direkt.',
              run: () => setPlannedPause(null),
            })}
            disabled={updating}
            className="col-span-2 rounded-md border border-status-warning-fg/30 bg-status-warning-bg px-3 py-2 text-left text-xs font-semibold text-status-warning-fg hover:bg-status-warning-bg/80 transition-colors"
          >
            Ta bort paus ({shortDateSv(customer.paused_until)})
          </button>
        )}
      </div>

      <ConfirmActionDialog
        open={Boolean(confirmAction)}
        onOpenChange={(v) => !v && setConfirmAction(null)}
        title={confirmAction?.label || ''}
        description={confirmAction?.description || ''}
        confirmLabel="Bekräfta"
        onConfirm={() => confirmAction?.run() || Promise.resolve()}
        pending={updating}
      />
    </div>
  );
}
