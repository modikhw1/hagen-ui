'use client';

import { useEffect, useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { formatAuditMetadata } from '@/lib/admin-derive/audit';
import { timeAgoSv } from '@/lib/admin/time';
import type { AuditLogResponse } from '@/lib/admin/schemas/audit';

type AuditEntry = AuditLogResponse['entries'][number];

type Props = {
  entries: AuditEntry[];
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  onLoadMore: () => void;
};

const VIRTUALIZE_THRESHOLD = 50;
const TABLE_HEIGHT = 640;

export function AuditLogTable({
  entries,
  hasNextPage,
  isFetchingNextPage,
  onLoadMore,
}: Props) {
  const parentRef = useRef<HTMLDivElement | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const shouldVirtualize = entries.length > VIRTUALIZE_THRESHOLD;
  // TanStack Virtual exposes imperative helpers; React Compiler should not memoize this hook.
  // eslint-disable-next-line react-hooks/incompatible-library
  const rowVirtualizer = useVirtualizer({
    count: entries.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 88,
    overscan: 8,
    enabled: shouldVirtualize,
  });

  useEffect(() => {
    if (!hasNextPage || isFetchingNextPage || !sentinelRef.current) {
      return;
    }

    const observer = new IntersectionObserver((observerEntries) => {
      if (observerEntries[0]?.isIntersecting) {
        onLoadMore();
      }
    });

    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, onLoadMore]);

  if (entries.length === 0) {
    return (
      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <div className="px-5 py-8 text-sm text-muted-foreground">
          Inga audit-poster hittades.
        </div>
      </div>
    );
  }

  if (!shouldVirtualize) {
    return (
      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <div className="divide-y divide-border">
          {entries.map((entry) => (
            <AuditLogRow key={entry.id} entry={entry} />
          ))}
        </div>
        <div ref={sentinelRef} className="h-1" />
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card">
      <div
        ref={parentRef}
        className="overflow-auto"
        style={{ maxHeight: `${TABLE_HEIGHT}px` }}
      >
        <div
          className="relative w-full"
          style={{ height: `${rowVirtualizer.getTotalSize()}px` }}
        >
          {rowVirtualizer.getVirtualItems().map((virtualRow) => {
            const entry = entries[virtualRow.index];
            if (!entry) {
              return null;
            }

            return (
              <div
                key={entry.id}
                className="absolute left-0 top-0 w-full border-b border-border"
                style={{ transform: `translateY(${virtualRow.start}px)` }}
              >
                <AuditLogRow entry={entry} />
              </div>
            );
          })}
        </div>
        <div ref={sentinelRef} className="h-1" />
      </div>
    </div>
  );
}

function AuditLogRow({ entry }: { entry: AuditEntry }) {
  return (
    <div className="grid gap-3 px-5 py-4 lg:grid-cols-[180px_1.2fr_1fr_1fr]">
      <div className="text-xs text-muted-foreground">{timeAgoSv(entry.created_at)}</div>
      <div>
        <div className="text-sm font-semibold text-foreground">{entry.action}</div>
        <div className="mt-1 text-xs text-muted-foreground">
          {entry.entity_type}
          {entry.entity_id ? ` Â· ${entry.entity_id}` : ''}
        </div>
      </div>
      <div className="text-sm text-foreground">
        {entry.actor_email || 'Okand anvandare'}
        <div className="mt-1 text-xs text-muted-foreground">
          {entry.actor_role || 'okand roll'}
        </div>
      </div>
      <div className="text-xs text-muted-foreground">{formatAuditMetadata(entry)}</div>
    </div>
  );
}
