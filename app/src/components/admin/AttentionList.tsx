'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useMutation } from '@tanstack/react-query';
import { ChevronDown, ChevronRight, ExternalLink, Filter } from 'lucide-react';
import { apiClient } from '@/lib/admin/api-client';
import { formatSek } from '@/lib/admin/money';
import { shortDateSv } from '@/lib/admin/time';
import { useOverviewRefresh } from '@/hooks/admin/useAdminRefresh';
import {
  addAdminBreadcrumb,
  captureAdminError,
} from '@/lib/admin/admin-telemetry';
import {
  attentionSeverity,
  attentionTimestamp,
  type AttentionItem,
  type AttentionSeverity,
} from '@/lib/admin-derive/attention';
import { StatusPill, SeverityPill } from '@/components/admin/ui/StatusPill';
import { OPERATOR_COPY } from '@/lib/admin/copy/operator-glossary';
import { cn } from '@/lib/utils';

type SortMode = 'standard' | 'oldest' | 'cm';

const GROUP_ORDER = [
  'invoice_unpaid',
  'customer_blocked',
  'cm_low_activity',
  'onboarding_stuck',
  'cm_change_due_today',
  'pause_resume_due_today',
  'demo_responded',
  'cm_notification',
] as const;

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
  const refreshOverview = useOverviewRefresh();
  const [sortMode, setSortMode] = useState<SortMode>('standard');
  const parsedLastSeenAt = lastSeenAt ? new Date(lastSeenAt) : null;

  useEffect(() => {
    if (mode !== 'open' || !trackSeen) return;
    void (async () => {
      try {
        await apiClient.post('/api/admin/notifications/mark-seen', { surface });
        await refreshOverview();
      } catch (error) {
        captureAdminError('admin.notifications.seen', error, { surface });
      }
    })();
  }, [mode, refreshOverview, surface, trackSeen]);

  const sortedItems = useMemo(() => {
    const list = [...items];
    if (sortMode === 'oldest') {
      return list.sort((a, b) => +(attentionTimestamp(a) ?? 0) - +(attentionTimestamp(b) ?? 0));
    }
    // Default: severity + timestamp desc handled by lib or basic sort here
    return list.sort((a, b) => {
      const sevA = attentionSeverity(a) === 'critical' ? 3 : attentionSeverity(a) === 'high' ? 2 : 1;
      const sevB = attentionSeverity(b) === 'critical' ? 3 : attentionSeverity(b) === 'high' ? 2 : 1;
      if (sevA !== sevB) return sevB - sevA;
      return +(attentionTimestamp(b) ?? 0) - +(attentionTimestamp(a) ?? 0);
    });
  }, [items, sortMode]);

  const grouped = useMemo(() => {
    if (sortMode === 'cm') {
      const cmMap = new Map<string, AttentionItem[]>();
      for (const item of sortedItems) {
        const cmName = item.cmName || 'Obemannad';
        const arr = cmMap.get(cmName) ?? [];
        arr.push(item);
        cmMap.set(cmName, arr);
      }
      return Array.from(cmMap.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([cmName, cmItems]) => {
          const typeMap = new Map<AttentionItem['kind'], AttentionItem[]>();
          for (const item of cmItems) {
            const arr = typeMap.get(item.kind) ?? [];
            arr.push(item);
            typeMap.set(item.kind, arr);
          }
          const typeGroups = GROUP_ORDER
            .filter((kind) => typeMap.has(kind))
            .map((kind) => ({ kind, items: typeMap.get(kind)! }));
          return { cmName, typeGroups, totalCount: cmItems.length };
        });
    }

    const map = new Map<AttentionItem['kind'], AttentionItem[]>();
    for (const item of sortedItems) {
      const arr = map.get(item.kind) ?? [];
      arr.push(item);
      map.set(item.kind, arr);
    }
    return GROUP_ORDER
      .filter((kind) => map.has(kind))
      .map((kind) => ({ kind, items: map.get(kind)! }));
  }, [sortedItems, sortMode]);

  if (items.length === 0) return null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
          Behöver hanteras
          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-bold text-primary">
            {items.length}
          </span>
        </h2>
        <div className="flex items-center gap-2">
          <Filter className="h-3.5 w-3.5 text-muted-foreground" />
          <select
            value={sortMode}
            onChange={(e) => setSortMode(e.target.value as SortMode)}
            className="bg-transparent text-xs font-medium text-muted-foreground focus:outline-none hover:text-foreground cursor-pointer"
          >
            <option value="standard">Sortera: Standard</option>
            <option value="oldest">Sortera: Äldst först</option>
            <option value="cm">Sortera: Per CM</option>
          </select>
        </div>
      </div>

      <div className="space-y-6">
        {sortMode === 'cm' 
          ? (grouped as any[]).map((cmGroup) => (
              <div key={cmGroup.cmName} className="space-y-3">
                <div className="flex items-center gap-2 px-1">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                    {cmGroup.cmName}
                  </span>
                  <div className="h-px flex-1 bg-border/50" />
                  <span className="text-[10px] font-medium text-muted-foreground/60">
                    {cmGroup.totalCount}
                  </span>
                </div>
                <div className="space-y-3">
                  {cmGroup.typeGroups.map((group: any) => (
                    <AttentionGroup key={group.kind} group={group} mode={mode} surface={surface} refresh={refreshOverview} />
                  ))}
                </div>
              </div>
            ))
          : (grouped as any[]).map((group) => (
              <AttentionGroup key={group.kind} group={group} mode={mode} surface={surface} refresh={refreshOverview} />
            ))
        }
      </div>
    </div>
  );
}

function AttentionGroup({ 
  group, 
  mode, 
  surface, 
  refresh 
}: { 
  group: { kind: string; items: AttentionItem[] }; 
  mode: 'open' | 'snoozed';
  surface: string;
  refresh: (cid?: string | null) => Promise<void>;
}) {
  return (
    <details className="group" open={group.items.length <= 3}>
      <summary className="flex cursor-pointer list-none items-center justify-between rounded-lg bg-secondary/20 px-3 py-2 text-xs font-semibold text-muted-foreground hover:bg-secondary/40">
        <div className="flex items-center gap-2 uppercase tracking-wider">
          <ChevronRight className="h-3.5 w-3.5 transition-transform group-open:rotate-90" />
          {OPERATOR_COPY.attention[group.kind as keyof typeof OPERATOR_COPY.attention] || group.kind}
          <span className="opacity-60">({group.items.length})</span>
        </div>
      </summary>
      <div className="mt-2 space-y-1 pl-2 border-l-2 border-border ml-4">
        {group.items.map((item) => (
          <AttentionRow 
            key={`${item.kind}-${item.id}`} 
            item={item} 
            mode={mode} 
            surface={surface} 
            refresh={refresh}
          />
        ))}
      </div>
    </details>
  );
}

function AttentionRow({ 
  item, 
  mode, 
  surface,
  refresh
}: { 
  item: AttentionItem; 
  mode: 'open' | 'snoozed';
  surface: string;
  refresh: (cid?: string | null) => Promise<void>;
}) {
  const mutateAttention = useMutation({
    mutationFn: async () => {
      if (mode === 'open') {
        await apiClient.post(`/api/admin/attention/${item.subjectType}/${item.subjectId}/snooze`, { days: null });
      } else {
        await apiClient.del(`/api/admin/attention/${item.subjectType}/${item.subjectId}/snooze`);
      }
    },
    onSuccess: () => refresh('customerId' in item ? (item as any).customerId : null),
  });

  const href = hrefForItem(item);
  const severity = attentionSeverity(item);

  return (
    <div className="flex items-center justify-between gap-4 py-2 hover:bg-accent/10 px-2 rounded-md transition-colors group/row">
      <Link href={href} className="flex-1 min-w-0 flex items-center gap-3">
        <SeverityPill severity={severity} className="w-16 justify-center" />
        <div className="min-w-0">
          <div className="text-[13px] font-medium text-foreground truncate">
            {labelForItem(item)}
            <span className="mx-2 text-muted-foreground font-normal">·</span>
            <span className="text-muted-foreground font-normal">{subLabelForItem(item)}</span>
          </div>
        </div>
      </Link>
      <div className="flex items-center gap-2 opacity-0 group-hover/row:opacity-100 transition-opacity">
        <Link 
          href={href}
          className="rounded border border-border px-2 py-1 text-[10px] font-semibold uppercase hover:bg-background"
        >
          Öppna
        </Link>
        <button
          onClick={() => mutateAttention.mutate()}
          disabled={mutateAttention.isPending}
          className="rounded border border-border px-2 py-1 text-[10px] font-semibold uppercase hover:bg-background disabled:opacity-50"
        >
          {mode === 'open' ? 'Hanteras' : 'Släpp'}
        </button>
      </div>
    </div>
  );
}

function hrefForItem(item: AttentionItem) {
  switch (item.kind) {
    case 'demo_responded': return '/admin/demos?focus=responded';
    case 'cm_low_activity': return `/admin/team?focus=${item.subjectId}`;
    case 'cm_notification': return item.customerId ? `/admin/customers/${item.customerId}/activity` : '/admin/team';
    case 'invoice_unpaid': return `/admin/customers/${item.customerId}/billing/${item.id}`;
    case 'onboarding_stuck': return `/admin/customers/${item.customerId}`;
    case 'customer_blocked': return `/admin/customers/${item.customerId}`;
    case 'cm_change_due_today': return `/admin/customers/${item.customerId}/operations#cm`;
    case 'pause_resume_due_today': return `/admin/customers/${item.customerId}/operations`;
    default: return '#';
  }
}

function labelForItem(item: AttentionItem) {
  switch (item.kind) {
    case 'cm_notification': return item.from;
    case 'invoice_unpaid':
    case 'onboarding_stuck':
    case 'customer_blocked':
    case 'cm_change_due_today':
    case 'pause_resume_due_today': return item.customerName;
    case 'demo_responded': return item.companyName;
    case 'cm_low_activity': return item.cmName;
    default: return '';
  }
}

function subLabelForItem(item: AttentionItem) {
  switch (item.kind) {
    case 'cm_notification': return item.message;
    case 'invoice_unpaid': return `${formatSek(item.amount_ore)} · ${item.daysPastDue} dagar försenad`;
    case 'onboarding_stuck': return `Ingen rörelse på ${item.daysSinceCmReady} dagar`;
    case 'demo_responded': return 'Demo har fått svar';
    case 'customer_blocked': return `Blockerad i ${item.daysBlocked} dagar`;
    case 'cm_change_due_today': return `Byte planerat idag`;
    case 'pause_resume_due_today': return `Planerat återupptag idag`;
    case 'cm_low_activity': return `${item.interactionCount7d}/${item.expectedConcepts7d} interaktioner`;
    default: return '';
  }
}
