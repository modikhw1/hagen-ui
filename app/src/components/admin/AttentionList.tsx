'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { formatSek } from '@/lib/admin/money';
import { qk } from '@/lib/admin/queryKeys';
import { shortDateSv } from '@/lib/admin/time';
import {
  attentionSeverity,
  attentionTimestamp,
  type AttentionItem,
  type AttentionSeverity,
} from '@/lib/admin-derive/attention';

export default function AttentionList({
  items,
  mode = 'open',
  emptyLabel,
  lastSeenAt,
  trackSeen = false,
  surface = 'overview',
}: {
  items: AttentionItem[];
  mode?: 'open' | 'snoozed';
  emptyLabel?: string;
  lastSeenAt?: string | null;
  trackSeen?: boolean;
  surface?: 'overview' | 'notifications';
}) {
  const queryClient = useQueryClient();
  const parsedLastSeenAt = lastSeenAt ? new Date(lastSeenAt) : null;

  useEffect(() => {
    if (mode !== 'open' || !trackSeen) {
      return;
    }

    void (async () => {
      await fetch('/api/admin/events/attention-seen', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ surface }),
        keepalive: true,
      });

      await queryClient.invalidateQueries({ queryKey: qk.overviewRoot() });
    })();
  }, [mode, queryClient, surface, trackSeen]);

  const mutateAttention = useMutation({
    mutationFn: async (item: AttentionItem) => {
      const response = await fetch(
        `/api/admin/attention/${item.subjectType}/${item.subjectId}/snooze`,
        mode === 'open'
          ? {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'include',
              body: JSON.stringify({ days: null }),
            }
          : {
              method: 'DELETE',
              credentials: 'include',
            },
      );
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        throw new Error(
          payload.error ||
            (mode === 'open'
              ? 'Kunde inte markera som hanteras'
              : 'Kunde inte slappa hanteras-markeringen'),
        );
      }
      return item;
    },
    onSuccess: async (item) => {
      const customerId = customerIdForItem(item);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: qk.overviewRoot() }),
        customerId
          ? queryClient.invalidateQueries({ queryKey: ['admin', 'customer', customerId] })
          : Promise.resolve(),
      ]);
    },
  });

  if (items.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        {emptyLabel || 'Inget kraver uppmarksamhet just nu.'}
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {items.map((item) => {
        const href = hrefForItem(item);
        const severity = attentionSeverity(item);
        const timestamp = attentionTimestamp(item);
        const isNew =
          mode === 'open' && parsedLastSeenAt && timestamp
            ? +timestamp > +parsedLastSeenAt
            : false;
        const pending =
          mutateAttention.isPending &&
          mutateAttention.variables?.subjectType === item.subjectType &&
          mutateAttention.variables?.subjectId === item.subjectId;

        return (
          <div
            key={`${item.kind}-${item.id}`}
            className="flex flex-col gap-3 rounded-lg border border-border bg-card px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
          >
            <Link href={href} className="min-w-0 flex-1 transition-colors hover:text-foreground">
              <div className="flex flex-wrap items-center gap-2">
                <div className="text-sm font-semibold text-foreground">{labelForItem(item)}</div>
                <SeverityPill severity={severity} />
                {isNew ? (
                  <span className="rounded-full bg-info/10 px-2 py-0.5 text-[10px] font-semibold text-info">
                    Ny
                  </span>
                ) : null}
              </div>
              <div className="truncate text-xs text-muted-foreground">{subLabelForItem(item)}</div>
            </Link>

            <div className="flex items-center gap-2">
              <div className="shrink-0 text-right text-xs text-muted-foreground">{metaForItem(item)}</div>
              <Link
                href={href}
                className="rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-accent"
              >
                Oppna
              </Link>
              <button
                type="button"
                onClick={() => mutateAttention.mutate(item)}
                disabled={pending}
                className="rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-accent disabled:opacity-50"
              >
                {pending
                  ? mode === 'open'
                    ? 'Markerar...'
                    : 'Slapper...'
                  : mode === 'open'
                    ? 'Hanteras'
                    : 'Slapp'}
              </button>
            </div>
          </div>
        );
      })}

      {mutateAttention.isError ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {mutateAttention.error instanceof Error
            ? mutateAttention.error.message
            : mode === 'open'
              ? 'Kunde inte markera som hanteras.'
              : 'Kunde inte slappa hanteras-markeringen.'}
        </div>
      ) : null}
    </div>
  );
}

function hrefForItem(item: AttentionItem) {
  switch (item.kind) {
    case 'demo_responded':
      return '/admin/demos?focus=responded';
    case 'cm_low_activity':
      return `/admin/team?focus=${item.subjectId}`;
    case 'cm_notification':
      return item.customerId
        ? `/admin/customers/${item.customerId}/team`
        : '/admin/team';
    case 'invoice_unpaid':
      return `/admin/customers/${item.customerId}/billing/${item.id}`;
    case 'onboarding_stuck':
      return `/admin/customers/${item.customerId}`;
    case 'customer_blocked':
      return `/admin/customers/${item.customerId}`;
    case 'cm_change_due_today':
      return `/admin/customers/${item.customerId}/team`;
    case 'pause_resume_due_today':
      return `/admin/customers/${item.customerId}`;
  }
}

function customerIdForItem(item: AttentionItem) {
  if (item.kind === 'demo_responded') return null;
  return item.customerId;
}

function labelForItem(item: AttentionItem) {
  switch (item.kind) {
    case 'cm_notification':
      return item.from;
    case 'invoice_unpaid':
      return 'Obetald faktura';
    case 'onboarding_stuck':
      return 'Onboarding fastnat';
    case 'demo_responded':
      return item.companyName;
    case 'customer_blocked':
      return 'Kund blockerad';
    case 'cm_change_due_today':
      return item.customerName;
    case 'pause_resume_due_today':
      return item.customerName;
    case 'cm_low_activity':
      return item.cmName;
  }
}

function subLabelForItem(item: AttentionItem) {
  switch (item.kind) {
    case 'cm_notification':
      return item.message;
    case 'invoice_unpaid':
      return `${item.daysPastDue} dagar forsenad`;
    case 'onboarding_stuck':
      return `${item.daysSinceCmReady} dagar sedan CM redo`;
    case 'demo_responded':
      return 'Svar inkommet pa demo';
    case 'customer_blocked':
      return `${item.daysBlocked} dagar utan publicering`;
    case 'cm_change_due_today':
      return `${item.currentCmName || 'Nuvarande CM'} → ${item.nextCmName || 'Oallokerad'} idag`;
    case 'pause_resume_due_today':
      return 'Pausen ar planerad att slappa idag';
    case 'cm_low_activity':
      return item.interactionCount7d === 0
        ? `0 aktiviteter senaste 7 dagarna • forvantat ${item.expectedConcepts7d} koncept`
        : `${item.interactionCount7d} aktiviteter senaste 7 dagarna • ${item.lastInteractionDays} dagar sedan senaste aktivitet`;
  }
}

function metaForItem(item: AttentionItem) {
  switch (item.kind) {
    case 'cm_notification':
      return item.priority === 'urgent' ? 'Braskande' : shortDateSv(item.createdAt.toISOString());
    case 'invoice_unpaid':
      return formatSek(item.amount_ore);
    case 'onboarding_stuck':
      return 'CM redo';
    case 'demo_responded':
      return shortDateSv(item.respondedAt.toISOString());
    case 'customer_blocked':
      return 'TikTok';
    case 'cm_change_due_today':
      return shortDateSv(item.effectiveDate.toISOString());
    case 'pause_resume_due_today':
      return shortDateSv(item.resumeDate.toISOString());
    case 'cm_low_activity':
      return 'CM-puls';
  }
}

function SeverityPill({ severity }: { severity: AttentionSeverity }) {
  const className =
    severity === 'critical'
      ? 'bg-destructive/10 text-destructive'
      : severity === 'high'
        ? 'bg-warning/10 text-warning'
        : severity === 'medium'
          ? 'bg-info/10 text-info'
          : 'bg-secondary text-muted-foreground';

  const label =
    severity === 'critical'
      ? 'Akut'
      : severity === 'high'
        ? 'Hog'
        : severity === 'medium'
          ? 'Planera'
          : 'FYI';

  return (
    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${className}`}>
      {label}
    </span>
  );
}
