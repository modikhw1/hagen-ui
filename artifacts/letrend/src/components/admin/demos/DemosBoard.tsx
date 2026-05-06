'use client';

import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  ArrowRight,
  CalendarCheck,
  Copy,
  ExternalLink,
  FileText,
  Inbox,
  LayoutList,
  Loader2,
  MoreHorizontal,
  Pencil,
  Send,
  Trash2,
  UserCheck,
  X,
} from 'lucide-react';
import CreateDemoDialog, { type CreateDemoResult } from '@/components/admin/demos/CreateDemoDialog';
import ConvertDemoDialog from '@/components/admin/demos/ConvertDemoDialog';
import EditDemoDialog from '@/components/admin/demos/EditDemoDialog';
import GamePlanDrawer from '@/components/admin/demos/GamePlanDrawer';
import { DemoBoardSkeleton } from '@/components/admin/demos/DemoBoardSkeleton';
import { DemosFunnelBar } from '@/components/admin/demos/DemosFunnelBar';
import { useDemosBoard, useUpdateDemoStatus, useDeleteDemo } from '@/hooks/admin/useDemos';
import { useUrlState } from '@/hooks/useUrlState';
import { demosCopy } from '@/lib/admin/copy/demos';
import { demoStatusLabel, type DemoStatus } from '@/lib/admin-derive/demos';
import { formatSek } from '@/lib/admin/money';
import type { DemoCardDto } from '@/lib/admin/schemas/demos';
import { shortDateSv } from '@/lib/admin/time';
import { PageHeader } from '@/components/admin/ui/layout/PageHeader';
import KpiCard from '@/components/admin/ui/KpiCard';
import EmptyState from '@/components/admin/ui/EmptyState';
import { apiClient } from '@/lib/admin/api-client';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

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

function DemoReadinessIcons({
  studioConceptCount,
  hasFeedplan,
  hasGamePlan,
}: {
  studioConceptCount: number;
  hasFeedplan: boolean;
  hasGamePlan: boolean;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span
        title={`${studioConceptCount} studio-koncept`}
        className={`inline-flex items-center justify-center rounded-full p-0.5 ${
          studioConceptCount > 0 ? 'text-primary' : 'text-muted-foreground/40'
        }`}
      >
        <LayoutList className="h-3.5 w-3.5" />
      </span>
      <span
        title={hasFeedplan ? 'Feedplan klar' : 'Feedplan saknas'}
        className={`inline-flex items-center justify-center rounded-full p-0.5 ${
          hasFeedplan ? 'text-success' : 'text-muted-foreground/40'
        }`}
      >
        <CalendarCheck className="h-3.5 w-3.5" />
      </span>
      <span
        title={hasGamePlan ? 'Game Plan klart' : 'Game Plan saknas'}
        className={`inline-flex items-center justify-center rounded-full p-0.5 ${
          hasGamePlan ? 'text-info' : 'text-muted-foreground/40'
        }`}
      >
        <FileText className="h-3.5 w-3.5" />
      </span>
    </div>
  );
}

const DEMO_SHARE_BASE = 'https://letrend.se';

function buildShareUrl(token: string | null): string | null {
  if (!token) return null;
  return `${DEMO_SHARE_BASE}/d/${token}`;
}

type GamePlanDrawerState = {
  open: boolean;
  demoId: string | null;
  initialValues: {
    game_plan?: string | null;
    game_plan_html?: string | null;
    preview_notes?: string | null;
    strategy_view?: string | null;
    opportunities?: string | null;
    letrend_fit?: string | null;
    company_name?: string | null;
    contact_name?: string | null;
    tiktok_handle?: string | null;
    proposed_concepts_per_week?: number | null;
  };
};

const EMPTY_GAME_PLAN_DRAWER: GamePlanDrawerState = {
  open: false,
  demoId: null,
  initialValues: {},
};

export function DemosBoard({ days = 30 }: { days?: number }) {
  const { get, set } = useUrlState();
  const { data, isLoading, error } = useDemosBoard(days);
  const updateStatus = useUpdateDemoStatus();
  const deleteDemo = useDeleteDemo();

  const [searchQuery, setSearchQuery] = useState('');
  const [stageFilter, setStageFilter] = useState<StageFilter>('all');
  const [studioPendingId, setStudioPendingId] = useState<string | null>(null);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [gamePlanDrawer, setGamePlanDrawer] = useState<GamePlanDrawerState>(EMPTY_GAME_PLAN_DRAWER);
  const [convertTarget, setConvertTarget] = useState<{
    id: string;
    company_name: string;
    contact_email: string | null;
    proposed_price_ore: number | null;
  } | null>(null);

  const createOpen = createDialogOpen || get('action') === 'create';

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

  const editTarget = useMemo(
    () => allCards.find((item) => item.id === editId) ?? null,
    [allCards, editId],
  );

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
        const haystack = [
          card.companyName,
          card.contactName ?? '',
          card.contactEmail ?? '',
          card.tiktokHandle ?? '',
          card.ownerName ?? '',
        ]
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(normalizedSearch)) return false;
      }

      if (stageFilter === 'active') {
        return !['won', 'lost', 'expired'].includes(card.status);
      }
      if (stageFilter === 'won') return card.status === 'won';
      if (stageFilter === 'lost') return card.status === 'lost' || card.status === 'expired';
      return !['lost', 'expired'].includes(card.status);
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
      if (demo.status === 'draft') {
        await updateStatus.mutateAsync({ id: demo.id, status: 'sent', lost_reason: null });
      }
    } catch {
      toast.error('Kunde inte kopiera till urklipp.');
    }
  };

  const handleOpenPreview = (demo: DemoCardDto) => {
    const url = buildShareUrl(demo.shareToken);
    if (!url) {
      toast.error(demosCopy.copyLinkMissing);
      return;
    }
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const handleOpenStudio = async (demo: DemoCardDto) => {
    if (studioPendingId) return;
    setStudioPendingId(demo.id);
    try {
      const result = await apiClient.post(`/api/admin/demos/${demo.id}/prepare-studio`, {
        sync_tiktok_history: true,
      }) as {
        success: boolean;
        customerId?: string;
        error?: string;
        sync?: { status?: string; imported?: number; error?: string; reason?: string };
      };
      if (result.success && result.customerId) {
        if (result.sync?.status === 'error') {
          toast.warning(`Studio öppnas, men TikTok-ingest misslyckades: ${result.sync.error}`);
        } else if (result.sync?.status === 'ok') {
          toast.success(`TikTok-historik hämtad: ${result.sync.imported ?? 0} nya klipp.`);
        }
        window.open(`/studio/customers/${result.customerId}?section=feed`, '_blank');
      } else {
        toast.error(result.error || 'Kunde inte förbereda Studio.');
      }
    } catch {
      toast.error('Ett oväntat fel uppstod.');
    } finally {
      setStudioPendingId(null);
    }
  };

  const handleDelete = async (demo: DemoCardDto) => {
    if (!confirm(`Ta bort demo för "${demo.companyName}"? Åtgärden går inte att ångra.`)) return;
    await deleteDemo.mutateAsync(demo.id);
    toast.success(`Demo för ${demo.companyName} borttagen.`);
  };

  const handleOpenGamePlanDrawer = (demo: DemoCardDto) => {
    setGamePlanDrawer({
      open: true,
      demoId: demo.id,
      initialValues: {
        company_name: demo.companyName,
        contact_name: demo.contactName ?? null,
        tiktok_handle: demo.tiktokHandle ?? null,
        proposed_concepts_per_week: demo.proposedConceptsPerWeek ?? null,
        game_plan: demo.gamePlan ?? null,
        game_plan_html: demo.gamePlanHtml ?? null,
        preview_notes: demo.previewNotes ?? null,
      },
    });
  };

  const handleCreated = async (result?: CreateDemoResult) => {
    const sync = result?.sync;
    if (sync?.status === 'error') {
      toast.warning(`Demo skapades, men TikTok-ingest misslyckades: ${sync.error}`);
    } else if (sync?.status === 'ok') {
      toast.success(`Ny demo skapades. ${sync.imported ?? 0} historikklipp importerade.`);
    } else {
      toast.success(demosCopy.createSuccess);
    }

    const demoId = result?.demo?.id;
    if (typeof demoId === 'string' && demoId) {
      const demo = result?.demo as Record<string, unknown> | undefined;
      setGamePlanDrawer({
        open: true,
        demoId,
        initialValues: {
          company_name: typeof demo?.companyName === 'string' ? demo.companyName : null,
          contact_name: typeof demo?.contactName === 'string' ? demo.contactName : null,
          tiktok_handle: typeof demo?.tiktokHandle === 'string' ? demo.tiktokHandle : null,
          proposed_concepts_per_week:
            typeof demo?.proposedConceptsPerWeek === 'number'
              ? demo.proposedConceptsPerWeek
              : null,
        },
      });
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
            onClick={() => {
              setCreateDialogOpen(true);
              set({ action: 'create' });
            }}
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
                  <th className="border-b border-border px-3 py-2">CM / Studio</th>
                  <th className="border-b border-border px-3 py-2">Pris</th>
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
                          {stale ? (
                            <div className="mt-1">
                              <span className="inline-flex items-center rounded border border-destructive/30 bg-destructive/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-destructive">
                                {demosCopy.staleWarning}
                              </span>
                            </div>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-3 py-3 align-top text-xs">
                        <div className="flex flex-col gap-1.5">
                          <span className="font-medium text-foreground">
                            {demo.ownerName ?? demosCopy.ownerMissing}
                          </span>
                          <DemoReadinessIcons
                            studioConceptCount={demo.studioConceptCount ?? 0}
                            hasFeedplan={demo.hasFeedplan}
                            hasGamePlan={demo.hasGamePlan ?? false}
                          />
                        </div>
                      </td>
                      <td className="px-3 py-3 align-top text-xs text-muted-foreground">
                        {formatSek(demo.proposedPriceOre, { fallback: demosCopy.noPrice })}
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

                      {/* ─── ACTIONS ─── 2 inline + conditional advance + overflow menu */}
                      <td className="px-3 py-3 align-top">
                        <div className="flex items-center justify-end gap-1">

                          {/* Kopiera länk */}
                          <button
                            type="button"
                            onClick={() => void handleCopyLink(demo)}
                            disabled={!demo.shareToken}
                            title={demosCopy.copyLink}
                            className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-xs font-medium hover:bg-accent disabled:opacity-40"
                          >
                            <Copy className="h-3 w-3" />
                            Kopiera länk
                          </button>

                          {/* Flytta framåt — only for active demos with a next step */}
                          {!isClosed && demo.nextStatus ? (
                            <button
                              type="button"
                              onClick={() => void handleAdvance(demo)}
                              disabled={busy}
                              className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-2 py-1 text-xs font-semibold text-primary hover:bg-primary/20 disabled:opacity-50"
                            >
                              {busy ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <ArrowRight className="h-3 w-3" />
                              )}
                              Flytta framåt
                            </button>
                          ) : null}

                          {/* Overflow dropdown */}
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <button
                                type="button"
                                className="inline-flex items-center justify-center rounded-md border border-border bg-background p-1.5 text-xs hover:bg-accent"
                                title="Fler åtgärder"
                              >
                                <MoreHorizontal className="h-3.5 w-3.5" />
                              </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-44">
                              <DropdownMenuItem
                                onClick={() => void handleOpenStudio(demo)}
                                disabled={studioPendingId === demo.id}
                              >
                                {studioPendingId === demo.id ? (
                                  <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  <ExternalLink className="mr-2 h-3.5 w-3.5" />
                                )}
                                Öppna Studio
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => handleOpenPreview(demo)}
                                disabled={!demo.shareToken}
                              >
                                <ExternalLink className="mr-2 h-3.5 w-3.5" />
                                Preview
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onClick={() => setEditId(demo.id)}
                              >
                                <Pencil className="mr-2 h-3.5 w-3.5" />
                                Redigera
                              </DropdownMenuItem>
                              {!isClosed ? (
                                <>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem
                                    onClick={() => void handleLose(demo)}
                                    disabled={busy}
                                    className="text-destructive focus:text-destructive"
                                  >
                                    <X className="mr-2 h-3.5 w-3.5" />
                                    Markera förlorad
                                  </DropdownMenuItem>
                                </>
                              ) : null}
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onClick={() => void handleDelete(demo)}
                                disabled={deleteDemo.isPending}
                                className="text-destructive focus:text-destructive"
                              >
                                <Trash2 className="mr-2 h-3.5 w-3.5" />
                                Ta bort
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>

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
        onClose={() => {
          setCreateDialogOpen(false);
          set({ action: null });
        }}
        onCreated={(result) => void handleCreated(result)}
      />

      <EditDemoDialog
        demo={editTarget}
        open={Boolean(editTarget)}
        onClose={() => setEditId(null)}
        onSaved={() => {
          toast.success(demosCopy.editSuccess);
        }}
      />

      <ConvertDemoDialog
        demo={convertTarget}
        open={Boolean(convertTarget)}
        onClose={() => setConvertTarget(null)}
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

      <GamePlanDrawer
        open={gamePlanDrawer.open}
        demoId={gamePlanDrawer.demoId}
        initialValues={gamePlanDrawer.initialValues}
        onClose={() => setGamePlanDrawer(EMPTY_GAME_PLAN_DRAWER)}
        onSaved={() => {
          toast.success(demosCopy.editSuccess);
        }}
      />
    </div>
  );
}
