'use client';

import Link from 'next/link';
import { CalendarClock, CalendarRange, XCircle } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import EmptyState from '@/components/admin/EmptyState';
import ConfirmActionDialog from '@/components/admin/ConfirmActionDialog';
import { AdminField } from '@/components/admin/shared/AdminField';
import { AdminFormDialog } from '@/components/admin/ui/feedback/AdminFormDialog';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { apiClient } from '@/lib/admin/api-client';
import { invalidateAdminScopes } from '@/lib/admin/invalidate';
import { qk } from '@/lib/admin/queryKeys';
import type { PayrollResponse } from '@/lib/admin/schemas/payroll';
import { toast } from 'sonner';

type ScheduledChange = PayrollResponse['scheduled_changes'][number];

type Props = {
  periodKey: string;
  scheduledChanges: PayrollResponse['scheduled_changes'];
};

type HandoverGroup = {
  key: 'today' | 'week' | 'future';
  label: string;
  rows: ScheduledChange[];
};

function startOfDay(date: Date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function groupChanges(rows: ScheduledChange[]) {
  const today = startOfDay(new Date());
  const weekEnd = addDays(today, 7);

  const groups: HandoverGroup[] = [
    { key: 'today', label: 'Idag', rows: [] },
    { key: 'week', label: 'Den här veckan', rows: [] },
    { key: 'future', label: 'Framåt', rows: [] },
  ];

  for (const row of rows) {
    const effective = startOfDay(new Date(row.effective_date));
    if (Number.isNaN(effective.getTime())) {
      groups[2]?.rows.push(row);
      continue;
    }

    if (effective.getTime() <= today.getTime()) {
      groups[0]?.rows.push(row);
      continue;
    }

    if (effective.getTime() <= weekEnd.getTime()) {
      groups[1]?.rows.push(row);
      continue;
    }

    groups[2]?.rows.push(row);
  }

  return groups
    .map((group) => ({
      ...group,
      rows: group.rows.sort((left, right) =>
        left.effective_date.localeCompare(right.effective_date),
      ),
    }))
    .filter((group) => group.rows.length > 0);
}

export function PayrollHandoverList({ periodKey, scheduledChanges }: Props) {
  const queryClient = useQueryClient();
  const groups = useMemo(() => groupChanges(scheduledChanges), [scheduledChanges]);
  const [cancelTarget, setCancelTarget] = useState<ScheduledChange | null>(null);
  const [rescheduleTarget, setRescheduleTarget] = useState<ScheduledChange | null>(null);
  const [effectiveDate, setEffectiveDate] = useState('');
  const [rescheduleError, setRescheduleError] = useState<string | null>(null);

  const refreshViews = async () => {
    await invalidateAdminScopes(queryClient, ['payroll', 'team']);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: qk.payroll.period(periodKey) }),
      queryClient.invalidateQueries({ queryKey: qk.team.overview() }),
    ]);
  };

  const cancelMutation = useMutation({
    mutationFn: async (customerId: string) =>
      apiClient.post('/api/admin/team/handover/cancel', { customer_id: customerId }),
    onSuccess: async () => {
      toast.success('Schemalagd handover avbröts.');
      await refreshViews();
      setCancelTarget(null);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Kunde inte avbryta handover.');
    },
  });

  const rescheduleMutation = useMutation({
    mutationFn: async (payload: { customerId: string; date: string }) =>
      apiClient.post('/api/admin/team/handover/reschedule', {
        customer_id: payload.customerId,
        effective_date: payload.date,
      }),
    onSuccess: async () => {
      toast.success('Schemalagt byte uppdaterades.');
      await refreshViews();
      setRescheduleTarget(null);
      setEffectiveDate('');
      setRescheduleError(null);
    },
    onError: (error) => {
      setRescheduleError(
        error instanceof Error ? error.message : 'Kunde inte tidigarelägga handover.',
      );
    },
  });

  const openRescheduleDialog = (change: ScheduledChange) => {
    setRescheduleTarget(change);
    setEffectiveDate(change.effective_date);
    setRescheduleError(null);
  };

  return (
    <section className="rounded-lg border border-border bg-card p-5">
      <div className="mb-3">
        <h2 className="text-sm font-semibold text-foreground">Schemalagda handovers</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Kommande CM-byten som går att avbryta eller tidigarelägga direkt från payroll.
        </p>
      </div>

      {scheduledChanges.length === 0 ? (
        <EmptyState
          icon={CalendarClock}
          title="Inga schemalagda CM-byten"
          hint="Nya handovers dyker upp här när du schemalägger ett kommande CM-byte."
        />
      ) : (
        <div className="space-y-4">
          {groups.map((group) => (
            <div key={group.key} className="space-y-2">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                {group.label}
              </div>
              {group.rows.map((change) => (
                <article
                  key={`${change.customer_id}-${change.effective_date}`}
                  className="rounded-md border border-border bg-secondary/20 px-3 py-3"
                >
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <div className="text-sm font-medium text-foreground">
                        {change.customer_name} · {change.current_cm_name || 'Ingen CM'} {'->'}{' '}
                        {change.next_cm_name || 'Ingen CM'}
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        Aktivt från {change.effective_date}
                        {change.handover_note ? ` · ${change.handover_note}` : ''}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        href={`/admin/customers/${change.customer_id}`}
                        className={buttonVariants({ variant: 'outline', size: 'sm' })}
                      >
                        Visa kund
                      </Link>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => openRescheduleDialog(change)}
                      >
                        <CalendarRange className="h-4 w-4" />
                        Tidigarelägg
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:text-destructive"
                        onClick={() => setCancelTarget(change)}
                      >
                        <XCircle className="h-4 w-4" />
                        Avbryt
                      </Button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          ))}
        </div>
      )}

      <ConfirmActionDialog
        open={Boolean(cancelTarget)}
        onOpenChange={(open: boolean) => {
          if (!open) {
            setCancelTarget(null);
          }
        }}
        title="Avbryt schemalagd handover?"
        description={
          cancelTarget
            ? `CM-bytet för ${cancelTarget.customer_name} tas bort från schemat.`
            : 'CM-bytet tas bort från schemat.'
        }
        confirmLabel="Avbryt handover"
        onConfirm={() => {
          if (!cancelTarget) {
            return;
          }
          cancelMutation.mutate(cancelTarget.customer_id);
        }}
        pending={cancelMutation.isPending}
      />

      <AdminFormDialog
        open={Boolean(rescheduleTarget)}
        onClose={() => {
          setRescheduleTarget(null);
          setRescheduleError(null);
        }}
        title="Tidigarelägg handover"
        description={
          rescheduleTarget
            ? `Sätt nytt aktivt datum för ${rescheduleTarget.customer_name}.`
            : undefined
        }
        error={rescheduleError}
        size="sm"
        footer={
          <>
            <button
              onClick={() => {
                setRescheduleTarget(null);
                setRescheduleError(null);
              }}
              disabled={rescheduleMutation.isPending}
              className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-accent"
            >
              Avbryt
            </button>
            <button
              onClick={async () => {
                if (!rescheduleTarget || !effectiveDate) {
                  setRescheduleError('Välj ett datum.');
                  return;
                }

                await rescheduleMutation.mutateAsync({
                  customerId: rescheduleTarget.customer_id,
                  date: effectiveDate,
                });
              }}
              disabled={rescheduleMutation.isPending || !effectiveDate}
              className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
            >
              {rescheduleMutation.isPending ? 'Sparar...' : 'Spara nytt datum'}
            </button>
          </>
        }
      >
        <AdminField
          label="Aktivt från"
          htmlFor="payroll-handover-effective-date"
          hint="Datumet styr när assignment byts i cron-körningen."
        >
          <Input
            id="payroll-handover-effective-date"
            type="date"
            value={effectiveDate}
            onChange={(event) => {
              setEffectiveDate(event.target.value);
              setRescheduleError(null);
            }}
          />
        </AdminField>
      </AdminFormDialog>
    </section>
  );
}
