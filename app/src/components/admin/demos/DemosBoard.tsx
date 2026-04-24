'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  DndContext,
  KeyboardSensor,
  MouseSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { toast } from 'sonner';
import CreateDemoDialog from '@/components/admin/demos/CreateDemoDialog';
import ConvertDemoDialog from '@/components/admin/demos/ConvertDemoDialog';
import { DemoBoardSkeleton } from '@/components/admin/demos/DemoBoardSkeleton';
import { DemoCard } from '@/components/admin/demos/DemoCard';
import { DemoColumn } from '@/components/admin/demos/DemoColumn';
import { useDemosBoard, useUpdateDemoStatus } from '@/hooks/admin/useDemos';
import { useUrlState } from '@/hooks/useUrlState';
import { demosCopy } from '@/lib/admin/copy/demos';
import { demoStatusLabel, type DemoStatus } from '@/lib/admin-derive/demos';
import type { DemoCardDto } from '@/lib/admin/schemas/demos';
import { PageHeader } from '@/components/admin/ui/layout/PageHeader';
import KpiCard from '@/components/admin/ui/KpiCard';
import EmptyState from '@/components/admin/ui/EmptyState';
import { Send, Eye, UserCheck, Inbox } from 'lucide-react';

const FILTER_STORAGE_KEY = 'demos.filters.v1';
const DAY_OPTIONS = [7, 30, 90] as const;

type ColumnKey = 'draft' | 'sent' | 'opened' | 'responded' | 'closed';
type PriceRange = 'no-price' | 'under-10k' | '10k-20k' | '20k-plus';

const columnsConfig: Array<{
  key: ColumnKey;
  label: string;
  statuses: DemoStatus[];
}> = [
  { key: 'draft', label: demosCopy.draftColumn, statuses: ['draft'] },
  { key: 'sent', label: demosCopy.sentColumn, statuses: ['sent'] },
  { key: 'opened', label: demosCopy.openedColumn, statuses: ['opened'] },
  { key: 'responded', label: demosCopy.respondedColumn, statuses: ['responded'] },
  { key: 'closed', label: demosCopy.closedColumn, statuses: ['won', 'lost', 'expired'] },
];

function statusToColumn(status: DemoStatus): ColumnKey {
  if (status === 'draft') return 'draft';
  if (status === 'sent') return 'sent';
  if (status === 'opened') return 'opened';
  if (status === 'responded') return 'responded';
  return 'closed';
}

function priceRangeFor(ore: number | null): PriceRange {
  if (ore == null) return 'no-price';
  if (ore < 1_000_000) return 'under-10k';
  if (ore < 2_000_000) return '10k-20k';
  return '20k-plus';
}

function parseFilters(raw: string | null) {
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as {
      query?: string;
      columns?: ColumnKey[];
      owners?: string[];
      priceRanges?: PriceRange[];
    };
    return {
      query: typeof parsed.query === 'string' ? parsed.query : '',
      columns: Array.isArray(parsed.columns) ? parsed.columns : [...columnsConfig.map((entry) => entry.key)],
      owners: Array.isArray(parsed.owners) ? parsed.owners : [],
      priceRanges: Array.isArray(parsed.priceRanges) ? parsed.priceRanges : [],
    };
  } catch {
    return null;
  }
}

function defaultFilters() {
  return {
    query: '',
    columns: columnsConfig.map((entry) => entry.key),
    owners: [] as string[],
    priceRanges: [] as PriceRange[],
  };
}

export function DemosBoard({ days = 30 }: { days?: number }) {
  const { get, set } = useUrlState();
  const { data, isLoading, error } = useDemosBoard(days);
  const updateStatus = useUpdateDemoStatus();
  const sensors = useSensors(
    useSensor(MouseSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const initialFilters = useMemo(() => {
    if (typeof window === 'undefined') {
      return defaultFilters();
    }
    return parseFilters(window.localStorage.getItem(FILTER_STORAGE_KEY)) ?? defaultFilters();
  }, []);
  const [searchQuery, setSearchQuery] = useState(initialFilters.query);
  const [selectedColumns, setSelectedColumns] = useState<ColumnKey[]>(initialFilters.columns);
  const [selectedOwners, setSelectedOwners] = useState<string[]>(initialFilters.owners);
  const [selectedPriceRanges, setSelectedPriceRanges] = useState<PriceRange[]>(
    initialFilters.priceRanges,
  );

  const focusedColumn = get<ColumnKey>('focus');
  const createOpen = get('action') === 'create';
  const convertId = get('convert');
  const daysParam = Number.parseInt(get('days') ?? '', 10);
  const activeDays = DAY_OPTIONS.includes(daysParam as (typeof DAY_OPTIONS)[number]) ? daysParam : days;

  const allCards = useMemo(
    () =>
      data
        ? [
            ...data.columns.draft,
            ...data.columns.sent,
            ...data.columns.opened,
            ...data.columns.responded,
            ...data.columns.closed,
          ]
        : [],
    [data],
  );

  const ownerOptions = useMemo(
    () =>
      Array.from(
        new Set(
          allCards
            .map((card) => card.ownerName?.trim() ?? '')
            .filter((value): value is string => value.length > 0),
        ),
      ).sort((left, right) => left.localeCompare(right, 'sv')),
    [allCards],
  );

  const convertTarget = useMemo(() => {
    const card = allCards.find((item) => item.id === convertId);
    if (!card) return null;

    return {
      id: card.id,
      company_name: card.companyName,
      contact_email: card.contactEmail,
      proposed_price_ore: card.proposedPriceOre,
    };
  }, [allCards, convertId]);

  useEffect(() => {
    window.localStorage.setItem(
      FILTER_STORAGE_KEY,
      JSON.stringify({
        query: searchQuery,
        columns: selectedColumns,
        owners: selectedOwners,
        priceRanges: selectedPriceRanges,
      }),
    );
  }, [searchQuery, selectedColumns, selectedOwners, selectedPriceRanges]);

  useEffect(() => {
    if (!focusedColumn) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      const element = document.querySelector<HTMLElement>(
        `[data-demo-column="${focusedColumn}"]`,
      );
      element?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [focusedColumn]);

  if (isLoading) {
    return <DemoBoardSkeleton />;
  }

  if (error || !data) {
    return (
      <div className="rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
        {error instanceof Error ? error.message : demosCopy.loadBoardError}
      </div>
    );
  }

  const normalizedSearch = searchQuery.trim().toLowerCase();
  const filteredCards = allCards.filter((card) => {
    if (normalizedSearch) {
      const haystack = [
        card.companyName,
        card.contactEmail ?? '',
        card.tiktokHandle ?? '',
      ]
        .join(' ')
        .toLowerCase();
      if (!haystack.includes(normalizedSearch)) {
        return false;
      }
    }

    const column = statusToColumn(card.status);
    if (!selectedColumns.includes(column)) {
      return false;
    }

    if (selectedOwners.length > 0) {
      const owner = card.ownerName?.trim() ?? '';
      if (!selectedOwners.includes(owner)) {
        return false;
      }
    }

    if (selectedPriceRanges.length > 0) {
      const range = priceRangeFor(card.proposedPriceOre);
      if (!selectedPriceRanges.includes(range)) {
        return false;
      }
    }

    return true;
  });

  const filteredById = new Set(filteredCards.map((card) => card.id));
  const filteredColumns = {
    draft: data.columns.draft.filter((card) => filteredById.has(card.id)),
    sent: data.columns.sent.filter((card) => filteredById.has(card.id)),
    opened: data.columns.opened.filter((card) => filteredById.has(card.id)),
    responded: data.columns.responded.filter((card) => filteredById.has(card.id)),
    closed: data.columns.closed.filter((card) => filteredById.has(card.id)),
  };

  const handleAdvance = async (demo: DemoCardDto) => {
    const nextStatus = demo.nextStatus;
    if (!nextStatus) {
      return;
    }

    await updateStatus.mutateAsync({
      id: demo.id,
      status: nextStatus,
      lost_reason: null,
    });

    toast.success(
      demosCopy.statusMoved(
        demo.companyName,
        demoStatusLabel(nextStatus).toLowerCase(),
      ),
    );
  };

  const handleLose = async (demo: DemoCardDto) => {
    await updateStatus.mutateAsync({
      id: demo.id,
      status: 'lost',
      lost_reason: null,
    });

    toast.warning(demosCopy.statusLost(demo.companyName));
  };

  const onDragEnd = (event: DragEndEvent) => {
    const overId = event.over?.id;
    if (typeof overId !== 'string') {
      return;
    }

    const activeData = event.active.data.current as
      | {
          status: DemoStatus;
          nextStatus: DemoStatus | null;
          demoId: string;
          companyName: string;
        }
      | undefined;

    if (!activeData) {
      return;
    }

    const targetColumn = overId as ColumnKey;
    const targetStatusMap: Record<ColumnKey, DemoStatus | null> = {
      draft: 'draft',
      sent: 'sent',
      opened: 'opened',
      responded: 'responded',
      closed: null,
    };
    const targetStatus = targetStatusMap[targetColumn];

    if (!activeData.nextStatus || !targetStatus) {
      toast.warning('Det g\u00e5r bara att dra till n\u00e4sta steg i fl\u00f6det.');
      return;
    }

    if (targetStatus !== activeData.nextStatus) {
      toast.warning('Det g\u00e5r bara att dra till n\u00e4sta steg i fl\u00f6det.');
      return;
    }

    if (targetStatus === activeData.status) {
      return;
    }

    void (async () => {
      await updateStatus.mutateAsync({
        id: activeData.demoId,
        status: targetStatus,
        lost_reason: null,
      });
      toast.success(
        demosCopy.statusMoved(
          activeData.companyName,
          demoStatusLabel(targetStatus).toLowerCase(),
        ),
      );
    })();
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={demosCopy.pageTitle}
        subtitle={demosCopy.pageSubtitle}
        actions={
          <button
            type="button"
            onClick={() => set({ action: 'create' })}
            className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
          >
            {demosCopy.createButton}
          </button>
        }
      />

      <div className="space-y-3 rounded-lg border border-border bg-card p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Period
          </span>
          {DAY_OPTIONS.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => set({ days: option })}
              className={`rounded-md px-3 py-1 text-xs font-semibold transition-colors ${
                activeDays === option
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-secondary text-muted-foreground hover:text-foreground'
              }`}
            >
              {option} dagar
            </button>
          ))}
        </div>

        <div className="grid gap-3 lg:grid-cols-3">
          <input
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Sök bolag, e-post eller TikTok-handle"
            className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm"
          />
          <div className="flex flex-wrap items-center gap-2">
            {columnsConfig.map((column) => {
              const active = selectedColumns.includes(column.key);
              return (
                <button
                  key={column.key}
                  type="button"
                  onClick={() =>
                    setSelectedColumns((current) =>
                      active
                        ? current.filter((value) => value !== column.key)
                        : [...current, column.key],
                    )
                  }
                  className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                    active
                      ? 'bg-primary/10 text-primary'
                      : 'bg-secondary text-muted-foreground'
                  }`}
                >
                  {column.label}
                </button>
              );
            })}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {(['no-price', 'under-10k', '10k-20k', '20k-plus'] as const).map((range) => {
              const labels: Record<PriceRange, string> = {
                'no-price': 'Utan pris',
                'under-10k': '<10k',
                '10k-20k': '10k-20k',
                '20k-plus': '20k+',
              };
              const active = selectedPriceRanges.includes(range);
              return (
                <button
                  key={range}
                  type="button"
                  onClick={() =>
                    setSelectedPriceRanges((current) =>
                      active
                        ? current.filter((value) => value !== range)
                        : [...current, range],
                    )
                  }
                  className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                    active
                      ? 'bg-primary/10 text-primary'
                      : 'bg-secondary text-muted-foreground'
                  }`}
                >
                  {labels[range]}
                </button>
              );
            })}
          </div>
        </div>

        {ownerOptions.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {ownerOptions.map((owner) => {
              const active = selectedOwners.includes(owner);
              return (
                <button
                  key={owner}
                  type="button"
                  onClick={() =>
                    setSelectedOwners((current) =>
                      active
                        ? current.filter((value) => value !== owner)
                        : [...current, owner],
                    )
                  }
                  className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                    active
                      ? 'bg-info/10 text-info'
                      : 'bg-secondary text-muted-foreground'
                  }`}
                >
                  {owner}
                </button>
              );
            })}
          </div>
        ) : null}
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <KpiCard
          icon={<Send className="h-4 w-4" />}
          label="Skickade"
          value={String(data.sentLast30)}
          delta={{
            value: `${data.sentLast30 - data.sentPrev30 >= 0 ? '+' : ''}${data.sentLast30 - data.sentPrev30}`,
            label: '30d',
            tone: data.sentLast30 >= data.sentPrev30 ? 'success' : 'danger'
          }}
        />
        <KpiCard
          icon={<Eye className="h-4 w-4" />}
          label="Öppnade"
          value={String(data.openedLast30)}
          delta={{
            value: `${data.openedLast30 - data.openedPrev30 >= 0 ? '+' : ''}${data.openedLast30 - data.openedPrev30}`,
            label: '30d',
            tone: data.openedLast30 >= data.openedPrev30 ? 'success' : 'danger'
          }}
        />
        <KpiCard
          icon={<UserCheck className="h-4 w-4" />}
          label="Konverterade"
          value={String(data.convertedLast30)}
          delta={{
            value: `${data.convertedLast30 - data.convertedPrev30 >= 0 ? '+' : ''}${data.convertedLast30 - data.convertedPrev30}`,
            label: '30d',
            tone: data.convertedLast30 >= data.convertedPrev30 ? 'success' : 'danger'
          }}
        />
      </div>

      <DndContext sensors={sensors} onDragEnd={onDragEnd}>
        <div className="grid gap-4 xl:grid-cols-5">
          {columnsConfig.map((column) => {
            const items = filteredColumns[column.key];
            return (
              <DemoColumn
                key={column.key}
                columnKey={column.key}
                label={column.label}
                count={items.length}
                focused={focusedColumn === column.key}
              >
                {items.length === 0 ? (
                  <EmptyState 
                    title={demosCopy.emptyColumn} 
                  />
                ) : (
                  items.map((demo) => (
                    <DemoCard
                      key={demo.id}
                      demo={demo}
                      busy={updateStatus.isPending && updateStatus.variables?.id === demo.id}
                      onAdvance={() => void handleAdvance(demo)}
                      onConvert={() => set({ convert: demo.id })}
                      onLose={() => void handleLose(demo)}
                    />
                  ))
                )}
              </DemoColumn>
            );
          })}
        </div>
      </DndContext>

      <CreateDemoDialog
        open={createOpen}
        onClose={() => set({ action: null })}
        onCreated={() => {
          toast.success(demosCopy.createSuccess);
        }}
      />

      <ConvertDemoDialog
        demo={convertTarget}
        open={Boolean(convertTarget)}
        onClose={() => set({ convert: null })}
        onSaved={(result) => {
          if (result.warning) {
            toast.warning(result.warning);
            return;
          }

          toast.success(result.invite_sent ? demosCopy.convertedInvite : demosCopy.convertedCustomer);
        }}
      />
    </div>
  );
}
