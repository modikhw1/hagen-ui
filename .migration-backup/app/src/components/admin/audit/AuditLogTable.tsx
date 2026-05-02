'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { useVirtualizer } from '@tanstack/react-virtual';
import AdminAvatar from '@/components/admin/AdminAvatar';
import { Modal, Text } from '@mantine/core';
import { apiClient } from '@/lib/admin/api-client';
import { formatAuditMetadata } from '@/lib/admin-derive/audit';
import { parseDto } from '@/lib/admin/dtos/parse';
import { dateTimeSv, timeAgoSv } from '@/lib/admin/time';
import {
  auditLogEntryDetailResponseSchema,
  type AuditLogResponse,
} from '@/lib/admin/schemas/audit';

type AuditEntry = AuditLogResponse['entries'][number];

type Props = {
  entries: AuditEntry[];
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  onLoadMore: () => void;
};

type DiffSummary = {
  changed: number;
  added: number;
  removed: number;
};

const VIRTUALIZE_THRESHOLD = 50;
const TABLE_HEIGHT = 640;

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function jsonStable(value: unknown) {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function summarizeDiff(entry: AuditEntry): DiffSummary | null {
  const before = isObject(entry.before_state) ? entry.before_state : {};
  const after = isObject(entry.after_state) ? entry.after_state : {};
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);

  if (keys.size === 0) {
    return null;
  }

  let added = 0;
  let removed = 0;
  let changed = 0;

  for (const key of keys) {
    const hasBefore = Object.prototype.hasOwnProperty.call(before, key);
    const hasAfter = Object.prototype.hasOwnProperty.call(after, key);

    if (!hasBefore && hasAfter) {
      added += 1;
      continue;
    }

    if (hasBefore && !hasAfter) {
      removed += 1;
      continue;
    }

    if (jsonStable(before[key]) !== jsonStable(after[key])) {
      changed += 1;
    }
  }

  if (added === 0 && removed === 0 && changed === 0) {
    return null;
  }

  return { added, removed, changed };
}

function actorName(entry: AuditEntry) {
  return entry.actor_email || 'Okänd användare';
}

function entityLabel(entry: AuditEntry) {
  return entry.entity_label || entry.entity_id || entry.entity_type;
}

export function AuditLogTable({
  entries,
  hasNextPage,
  isFetchingNextPage,
  onLoadMore,
}: Props) {
  const parentRef = useRef<HTMLDivElement | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const [openEntryId, setOpenEntryId] = useState<string | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [detailById, setDetailById] = useState<Record<string, AuditEntry>>({});
  const shouldVirtualize = entries.length > VIRTUALIZE_THRESHOLD;
  const rowVirtualizer = useVirtualizer({
    count: entries.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 104,
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

  const summaryById = useMemo(
    () => new Map(entries.map((entry) => [entry.id, summarizeDiff(entry)])),
    [entries],
  );

  const openDetail = async (entry: AuditEntry) => {
    setOpenEntryId(entry.id);
    setDetailError(null);

    if (detailById[entry.id]) {
      return;
    }

    setLoadingDetail(true);
    try {
      const payload = await apiClient.get(`/api/admin/audit-log/${entry.id}`);
      const parsed = await parseDto(auditLogEntryDetailResponseSchema, payload, {
        name: 'auditLogEntryDetail',
        path: `/api/admin/audit-log/${entry.id}`,
      });

      setDetailById((current) => ({
        ...current,
        [entry.id]: parsed.entry,
      }));
    } catch (error) {
      setDetailError(error instanceof Error ? error.message : 'Kunde inte ladda diff.');
    } finally {
      setLoadingDetail(false);
    }
  };

  if (entries.length === 0) {
    return (
      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <div className="px-5 py-8 text-sm text-muted-foreground">
          Inga audit-poster hittades.
        </div>
      </div>
    );
  }

  return (
    <>
      {!shouldVirtualize ? (
        <div className="overflow-hidden rounded-lg border border-border bg-card">
          <div className="divide-y divide-border">
            {entries.map((entry) => (
              <AuditLogRow
                key={entry.id}
                entry={entry}
                diffSummary={summaryById.get(entry.id) ?? null}
                onOpenDetail={() => void openDetail(entry)}
              />
            ))}
          </div>
          <div ref={sentinelRef} className="h-1" />
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-card">
          <div
            ref={parentRef}
            className="overflow-auto"
            style={{ maxHeight: `${TABLE_HEIGHT}px` }}
          >
            <div className="relative w-full" style={{ height: `${rowVirtualizer.getTotalSize()}px` }}>
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
                    <AuditLogRow
                      entry={entry}
                      diffSummary={summaryById.get(entry.id) ?? null}
                      onOpenDetail={() => void openDetail(entry)}
                    />
                  </div>
                );
              })}
            </div>
            <div ref={sentinelRef} className="h-1" />
          </div>
        </div>
      )}

      <Modal
        opened={Boolean(openEntryId)}
        onClose={() => setOpenEntryId(null)}
        title="Audit-diff"
        size="xl"
      >
        <Text size="sm" color="dimmed" mb="lg">
          {openEntryId && detailById[openEntryId]
            ? `${detailById[openEntryId]?.action} · ${entityLabel(detailById[openEntryId] as AuditEntry)}`
            : 'Laddar detaljer...'}
        </Text>

        {loadingDetail ? (
          <div className="text-sm text-muted-foreground">Laddar diff...</div>
        ) : detailError ? (
          <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {detailError}
          </div>
        ) : openEntryId && detailById[openEntryId] ? (
          <div className="grid gap-3 md:grid-cols-2">
            <section>
              <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Before
              </div>
              <pre className="max-h-[420px] overflow-auto rounded-md border border-border bg-secondary/20 p-3 text-[11px] text-foreground">
                {JSON.stringify(detailById[openEntryId]?.before_state ?? {}, null, 2)}
              </pre>
            </section>
            <section>
              <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                After
              </div>
              <pre className="max-h-[420px] overflow-auto rounded-md border border-border bg-secondary/20 p-3 text-[11px] text-foreground">
                {JSON.stringify(detailById[openEntryId]?.after_state ?? {}, null, 2)}
              </pre>
            </section>
          </div>
        ) : null}
      </Modal>
    </>
  );
}

function AuditLogRow({
  entry,
  diffSummary,
  onOpenDetail,
}: {
  entry: AuditEntry;
  diffSummary: DiffSummary | null;
  onOpenDetail: () => void;
}) {
  return (
    <div className="grid gap-3 px-5 py-4 lg:grid-cols-[180px_1.3fr_1fr_1fr]">
      <div>
        <div className="text-xs text-muted-foreground" title={dateTimeSv(entry.created_at)}>
          {timeAgoSv(entry.created_at)}
        </div>
        <div className="mt-1 text-[11px] text-muted-foreground">{dateTimeSv(entry.created_at)}</div>
      </div>

      <div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-border bg-secondary/50 px-2 py-0.5 text-[11px] font-medium text-foreground">
            {entry.action}
          </span>
          {entry.entity_link ? (
            <Link
              href={entry.entity_link}
              className="inline-flex items-center gap-1 text-sm font-semibold text-foreground underline-offset-4 hover:underline"
            >
              {entityLabel(entry)}
              <ExternalLink className="h-3.5 w-3.5" />
            </Link>
          ) : (
            <span className="text-sm font-semibold text-foreground">{entityLabel(entry)}</span>
          )}
        </div>
        <div className="mt-1 text-xs text-muted-foreground">{entry.entity_type}</div>
      </div>

      <div className="flex items-start gap-2">
        <AdminAvatar name={actorName(entry)} size="sm" />
        <div className="min-w-0">
          <div className="truncate text-sm text-foreground">{actorName(entry)}</div>
          <div className="mt-1 text-xs text-muted-foreground">{entry.actor_role || 'okänd roll'}</div>
        </div>
      </div>

      <div>
        {diffSummary ? (
          <div className="space-y-2">
            <div className="text-xs text-muted-foreground">
              +{diffSummary.added} · -{diffSummary.removed} · ~{diffSummary.changed}
            </div>
            <button
              type="button"
              className="inline-flex items-center gap-1 text-xs font-medium text-foreground underline-offset-4 hover:underline"
              onClick={onOpenDetail}
            >
              Visa diff
            </button>
          </div>
        ) : (
          <div className="text-xs text-muted-foreground">{formatAuditMetadata(entry)}</div>
        )}
      </div>
    </div>
  );
}
