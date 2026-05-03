'use client';

import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  ArrowRight,
  Check,
  Copy,
  ExternalLink,
  Inbox,
  Loader2,
  Send,
  UserCheck,
  X,
} from 'lucide-react';
import CreateDemoDialog from '@/components/admin/demos/CreateDemoDialog';
import ConvertDemoDialog from '@/components/admin/demos/ConvertDemoDialog';
import { DemoBoardSkeleton } from '@/components/admin/demos/DemoBoardSkeleton';
import { DemosFunnelBar } from '@/components/admin/demos/DemosFunnelBar';
import { useDemosBoard, useUpdateDemoStatus } from '@/hooks/admin/useDemos';
import { useUrlState } from '@/hooks/useUrlState';
import { demosCopy } from '@/lib/admin/copy/demos';
import { demoStatusLabel, type DemoStatus } from '@/lib/admin-derive/demos';
import type { DemoCardDto } from '@/lib/admin/schemas/demos';
import { shortDateSv } from '@/lib/admin/time';
import { PageHeader } from '@/components/admin/ui/layout/PageHeader';
import KpiCard from '@/components/admin/ui/KpiCard';
import EmptyState from '@/components/admin/ui/EmptyState';
import { prepareDemoStudioAction } from '@/app/admin/_actions/demos';

const STAGE_FILTERS = [
  { key: 'all', label: 'Alla' },
  { key: 'active', label: 'Aktiva' },
  { key: 'won', label: 'Win' },
  { key: 'lost', label: 'Lost' },
] as const;

type StageFilter = (typeof STAGE_FILTERS)[number]['key'];

const STALE_DAYS = 21;
const STALE_STATUSES: DemoStatus[] = ['sent', 'opened', 'responded', 'quoted'];

function isStale(card: DemoCardDto): boolean {
  if (!STALE_STATUSES.includes(card.status)) return false;
  const age = Date.now() - new Date(card.statusChangedAt).getTime();
  return age > STALE_DAYS * 86_400_000;
}

function statusTone(status: DemoStatus): string {
  switch (status) {
    case 'won':
      return 'bg-success/10 text-success border-success/20';
    case 'lost':
    case 'expired':
      return 'bg-destructive/10 text-destructive border-destructive/20';
    case 'quoted':
      return 'bg-info/10 text-info border-info/20';
    case 'opened':
    case 'responded':
      return 'bg-primary/10 text-primary border-primary/20';
    case 'sent':
      return 'bg-secondary text-foreground border-border';
    case 'draft':
    default:
      return 'bg-muted text-muted-foreground border-border';
  }
}

function buildShareUrl(token: string | null): string | null {
  if (!token) return null;
  if (typeof window === 'undefined') return `/d/${token}`;
  return `${window.location.origin}/d/${token}`;
}

export function DemosBoard({ days = 30 }: { days?: number }) {
  const { get, set } = useUrlState();
  const { data, isLoading, error } = useDemosBoard(days);
  const updateStatus = useUpdateDemoStatus();

  const [searchQuery, setSearchQuery] = useState('');
  const [stageFilter, setStageFilter] = useState<StageFilter>('all');
  const [studioPendingId, setStudioPendingId] = useState<string | null>(null);

  const createOpen = get('action') === 'create';
  const convertId = get('convert');

  const allCards = useMemo<DemoCardDto[]>(
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
  const filteredCards = allCards
    .filter((card) => {
      if (normalizedSearch) {
        const haystack = [card.companyName, card.contactEmail ?? '', card.tiktokHandle ?? '']
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(normalizedSearch)) return false;
      }

      if (stageFilter === 'active') {
        return !['won', 'lost', 'expired'].includes(card.status);
      }
      if (stageFilter === 'won') return card.status === 'won';
      if (stageFilter === 'lost') return card.status === 'lost' || card.status === 'expired';
      return true;
    })
    .sort(
      (a, b) =>
        new Date(b.statusChangedAt).getTime() - new Date(a.statusChangedAt).getTime(),
    );

  const handleAdvance = async (demo: DemoCardDto) => {
    if (!demo.nextStatus) return;
    await updateStatus.mutateAsync({
      id: demo.id,
      status: demo.nextStatus,
      lost_reason: null,
    });
    toast.success(
      demosCopy.statusMoved(demo.companyName, demoStatusLabel(demo.nextStatus).toLowerCase()),
    );
  };

  const handleLose = async (demo: DemoCardDto) => {
    await updateStatus.mutateAsync({ id: demo.id, status: 'lost', lost_reason: null });
    toast.warning(demosCopy.statusLost(demo.companyName));
  };

  const handleCopyLink = async (demo: DemoCardDto) => {
    const url = buildShareUrl(demo.shareToken);
    if (!url) {
      toast.error(demosCopy.copyLinkMissing);
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      toast.success(demosCopy.copyLinkSuccess);
      // Auto-bump till "sent" om det fortfarande är förberett.
      if (demo.status === 'draft') {
        await updateStatus.mutateAsync({ id: demo.id, status: 'sent', lost_reason: null });
      }
    } catch {
      toast.error('Kunde inte kopiera till urklipp.');
    }
  };

  const handleOpenStudio = async (demo: DemoCardDto) => {
    if (studioPendingId) return;
    setStudioPendingId(demo.id);
    try {
      const result = await prepareDemoStudioAction(demo.id);
      if (result.success && result.customerId) {
        window.open(`/studio/customers/${result.customerId}`, '_blank');
      } else {
        toast.error(result.error || 'Kunde inte förbereda Studio.');
      }
    } catch {
      toast.error('Ett oväntat fel uppstod.');
    } finally {
      setStudioPendingId(null);
    }
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

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <KpiCard
          icon={<Send className="h-4 w-4" />}
          label="Skickade"
          value={String(data.sentLast30)}
          delta={{
            value: `${data.sentLast30 - data.sentPrev30 >= 0 ? '+' : ''}${data.sentLast30 - data.sentPrev30}`,
            label: '30d',
            tone: data.sentLast30 >= data.sentPrev30 ? 'success' : 'danger',
          }}
        />
        <KpiCard
          icon={<Inbox className="h-4 w-4" />}
          label="I dialog"
          value={String(data.openedLast30)}
          delta={{
            value: `${data.openedLast30 - data.openedPrev30 >= 0 ? '+' : ''}${data.openedLast30 - data.openedPrev30}`,
            label: '30d',
            tone: data.openedLast30 >= data.openedPrev30 ? 'success' : 'danger',
          }}
        />
        <KpiCard
          icon={<UserCheck className="h-4 w-4" />}
          label="Konverterade"
          value={String(data.convertedLast30)}
          delta={{
            value: `${data.convertedLast30 - data.convertedPrev30 >= 0 ? '+' : ''}${data.convertedLast30 - data.convertedPrev30}`,
            label: '30d',
            tone: data.convertedLast30 >= data.convertedPrev30 ? 'success' : 'danger',
          }}
        />
      </div>

      <DemosFunnelBar cards={allCards} />

      <div className="space-y-3 rounded-lg border border-border bg-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <input
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Sök bolag, e-post eller TikTok-handle"
            className="w-full max-w-md rounded-md border border-border bg-background px-3 py-2 text-sm"
          />
          <div className="flex flex-wrap gap-1">
            {STAGE_FILTERS.map((filter) => (
              <button
                key={filter.key}
                type="button"
                onClick={() => setStageFilter(filter.key)}
                className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                  stageFilter === filter.key
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-secondary text-muted-foreground hover:text-foreground'
                }`}
              >
                {filter.label}
              </button>
            ))}
          </div>
        </div>

        {filteredCards.length === 0 ? (
          <EmptyState title={demosCopy.emptyColumn} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-separate border-spacing-0 text-sm">
              <thead>
                <tr className="text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  <th className="border-b border-border px-3 py-2">Bolag</th>
                  <th className="border-b border-border px-3 py-2">Status</th>
                  <th className="border-b border-border px-3 py-2">Uppdaterad</th>
                  <th className="border-b border-border px-3 py-2 text-right">Åtgärder</th>
                </tr>
              </thead>
              <tbody>
                {filteredCards.map((demo) => {
                  const stale = isStale(demo);
                  const busy =
                    updateStatus.isPending && updateStatus.variables?.id === demo.id;
                  const isClosed =
                    demo.status === 'won' ||
                    demo.status === 'lost' ||
                    demo.status === 'expired';
                  return (
                    <tr
                      key={demo.id}
                      className="group border-b border-border/60 transition-colors hover:bg-secondary/40"
                    >
                      <td className="px-3 py-3 align-top">
                        <div className="flex flex-col">
                          <span className="font-semibold text-foreground">
                            {demo.companyName}
                          </span>
                          <span className="mt-0.5 text-xs text-muted-foreground">
                            {demo.tiktokHandle ? `@${demo.tiktokHandle}` : 'Ingen TikTok-handle'}
                            {demo.contactEmail ? ` · ${demo.contactEmail}` : ''}
                          </span>
                          <div className="mt-1 flex flex-wrap gap-1.5">
                            {!demo.hasFeedplan && demo.status === 'draft' ? (
                              <span className="inline-flex items-center rounded border border-warning/30 bg-warning/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-warning">
                                {demosCopy.feedplanMissing}
                              </span>
                            ) : null}
                            {stale ? (
                              <span className="inline-flex items-center rounded border border-destructive/30 bg-destructive/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-destructive">
                                {demosCopy.staleWarning}
                              </span>
                            ) : null}
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3 align-top">
                        <span
                          className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold ${statusTone(
                            demo.status,
                          )}`}
                        >
                          {demoStatusLabel(demo.status)}
                        </span>
                      </td>
                      <td className="px-3 py-3 align-top text-xs text-muted-foreground">
                        {shortDateSv(demo.statusChangedAt)}
                      </td>
                      <td className="px-3 py-3 align-top">
                        <div className="flex flex-wrap items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => void handleCopyLink(demo)}
                            disabled={!demo.shareToken}
                            title={demosCopy.copyLink}
                            className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-xs font-medium hover:bg-accent disabled:opacity-50"
                          >
                            <Copy className="h-3 w-3" />
                            Länk
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleOpenStudio(demo)}
                            disabled={studioPendingId === demo.id}
                            title={demosCopy.openStudio}
                            className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-xs font-medium hover:bg-accent disabled:opacity-50"
                          >
                            {studioPendingId === demo.id ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <ExternalLink className="h-3 w-3" />
                            )}
                            Studio
                          </button>
                          {!isClosed && demo.nextStatus ? (
                            <button
                              type="button"
                              onClick={() => void handleAdvance(demo)}
                              disabled={busy}
                              className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-2 py-1 text-xs font-semibold text-primary hover:bg-primary/15 disabled:opacity-50"
                            >
                              <ArrowRight className="h-3 w-3" />
                              {demoStatusLabel(demo.nextStatus)}
                            </button>
                          ) : null}
                          {!isClosed ? (
                            <>
                              <button
                                type="button"
                                onClick={() => set({ convert: demo.id })}
                                className="inline-flex items-center gap-1 rounded-md bg-success/10 px-2 py-1 text-xs font-semibold text-success hover:bg-success/15"
                              >
                                <Check className="h-3 w-3" />
                                Win
                              </button>
                              <button
                                type="button"
                                onClick={() => void handleLose(demo)}
                                disabled={busy}
                                className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
                              >
                                <X className="h-3 w-3" />
                                Lost
                              </button>
                            </>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

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
          toast.success(
            result.invite_sent ? demosCopy.convertedInvite : demosCopy.convertedCustomer,
          );
        }}
      />
    </div>
  );
}
