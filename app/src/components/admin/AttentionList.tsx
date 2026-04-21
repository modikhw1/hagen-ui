'use client';

import Link from 'next/link';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { formatSek } from '@/lib/admin/money';
import { shortDateSv } from '@/lib/admin/time';
import type { AttentionItem } from '@/lib/admin-derive/attention';

export default function AttentionList({
  items,
  mode = 'open',
  emptyLabel,
}: {
  items: AttentionItem[];
  mode?: 'open' | 'snoozed';
  emptyLabel?: string;
}) {
  const queryClient = useQueryClient();

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
        queryClient.invalidateQueries({ queryKey: ['admin', 'overview'] }),
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
              <div className="text-sm font-semibold text-foreground">{labelForItem(item)}</div>
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
  if (item.kind === 'demo_responded') return '/admin/demos';
  if (item.kind === 'invoice_unpaid' || item.kind === 'onboarding_stuck' || item.kind === 'customer_blocked') {
    return `/admin/customers/${item.customerId}`;
  }
  return item.customerId ? `/admin/customers/${item.customerId}` : '/admin';
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
  }
}
