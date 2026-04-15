'use client';

import React from 'react';
import { LeTrendColors, LeTrendRadius } from '@/styles/letrend-design-system';
import type { FeedPlannerSectionProps } from './feedTypes';
import { FeedSlot } from './FeedSlot';
import {
  WORKSPACE_CACHE_TTL_MS,
  WORKSPACE_CACHE_MAX_STALE_MS,
  getWorkspaceConceptDetails,
  getWorkspaceConceptTitle,
} from './shared';
import {
  buildSlotMap,
  projectTempoDate,
  TEMPO_PRESETS,
  globalFracToProjectedDate,
  dateToGlobalFrac,
} from '@/lib/feed-planner-utils';
import {
  calculateSlotCenters,
  buildCurvePath,
  buildSegmentPaths,
  buildGradients,
  updateGradientPositions,
} from '@/lib/eel-renderer';
import { createSpanHandlers, fracToY as spanFracToY } from '@/components/studio-v2/SpanHandlers';
import type { SpanHandlerRefs } from '@/components/studio-v2/SpanHandlers';
import { TagManager } from '@/features/studio/customer-workspace/components/TagManager';
import type {
  CustomerConcept,
  FeedSpan,
} from '@/types/studio-v2';
import { SPAN_COLOR_PALETTE } from '@/types/studio-v2';
import {
  clearClientCache,
  fetchAndCacheClient,
  readClientCache,
  writeClientCache,
} from '@/lib/client-cache';
import type { MotorSignalKind } from '@/lib/studio/motor-signal';
import { isStudioAssignedCustomerConcept } from '@/lib/studio/customer-concepts';
import { resolveConceptContent } from '@/lib/studio-v2-concept-content';
import { display } from '@/lib/display';
import { getStudioCustomerStatusMeta } from '@/lib/studio/customer-status';
import { TempoModal } from './TempoModal';
import { DraftConceptPicker } from './DraftConceptPicker';
import { FeedAdvanceCue } from './FeedAdvanceCue';
import { FeedReviewBanner } from './FeedReviewBanner';

// Suppress unused-import warnings for symbols that may be referenced in
// the JSX tree indirectly or kept for parity with the original file.
void resolveConceptContent;
void display;
void getStudioCustomerStatusMeta;

// ---------------------------------------------------------------------------
// Local helpers
// ---------------------------------------------------------------------------

type PositionedEelGradient = ReturnType<typeof updateGradientPositions>[number];

function formatCompactViews(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace('.0', '')}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace('.0', '')}k`;
  return String(n);
}

// ---------------------------------------------------------------------------
// FeedPlannerSection
// ---------------------------------------------------------------------------

export function FeedPlannerSection({
  customerId,
  concepts,
  pendingPlacementConcept,
  cmTags,
  gridConfig,
  historyOffset,
  setHistoryOffset,
  getConceptDetails,
  handleUpdateConceptTags,
  handleUpdateCmNote,
  handleUpdateTikTokUrl,
  handlePatchConcept,
  handleMarkProduced,
  handleCheckAndMarkProduced,
  handleReconcileHistory,
  handleUndoHistoryReconciliation,
  handleRemoveFromSlot,
  handleAssignToSlot,
  handleSwapFeedOrder,
  handleOpenMarkProducedDialog,
  onOpenConcept,
  onSlotClick,
  showTagManager,
  setShowTagManager,
  refreshCmTags,
  historyHasMore,
  fetchingProfileHistory,
  onLoadMoreHistory,
  pendingAdvanceCue,
  activeNudges,
  autoResolvedNudges,
  onAdvancePlan,
  advancingPlan,
  onDismissAdvanceCue,
  onDismissAutoResolvedSignals,
  tempoWeekdays,
  isTempoExplicit,
  onTempoWeekdaysChange,
  onOpenKonceptSection,
  onCancelPendingPlacement,
}: FeedPlannerSectionProps) {
  const gridRef = React.useRef<HTMLDivElement>(null);
  const gridWrapperRef = React.useRef<HTMLDivElement>(null);
  const [eelPath, setEelPath] = React.useState('');
  const [eelSegments, setEelSegments] = React.useState<string[]>([]);
  const [eelGradients, setEelGradients] = React.useState<PositionedEelGradient[]>([]);
  const [markingProducedFromCue, setMarkingProducedFromCue] = React.useState(false);
  // Purely local defer — hides the cue for this session without writing pending_history_advance_seen_at.
  // The signal stays unresolved on the backend: next page load will show the cue again.
  // Use "Inte nu" when the CM wants to think about it; use × for explicit acknowledgement.
  const [deferredAdvanceCue, setDeferredAdvanceCue] = React.useState(false);
  const [showCueOverflowMenu, setShowCueOverflowMenu] = React.useState(false);
  // Effective cue: merge new motor signals with legacy pendingAdvanceCue.
  // Motor signals take priority; pendingAdvanceCue is the fallback for pre-migration customers.
  const effectiveCue = React.useMemo(() => {
    if (activeNudges.length > 0) {
      const p = (activeNudges[0].payload ?? {}) as { imported_count?: number; kind?: string; latest_published_at?: string | null };
      return {
        imported: p.imported_count ?? 1,
        kind: (p.kind ?? 'fresh_activity') as MotorSignalKind,
        publishedAt: p.latest_published_at ?? null,
      };
    }
    return pendingAdvanceCue;
  }, [activeNudges, pendingAdvanceCue]);
  // Local focus state: set of imported-history concept IDs identified as fresh evidence for the
  // current motor cue. Populated when CM clicks "Granska historiken".
  // Pure UI — never written to backend. Used to apply a thin visual treatment in historik.
  const [focusedEvidenceIds, setFocusedEvidenceIds] = React.useState<ReadonlySet<string>>(new Set());
  // Auto-clear focusedEvidenceIds when the motor signal is resolved.
  // Prevents stale "nytt" badges from persisting after the cue is acknowledged via an action button.
  React.useEffect(() => {
    if (!effectiveCue) setFocusedEvidenceIds(new Set());
  }, [effectiveCue]);
  React.useEffect(() => {
    if (!effectiveCue) {
      setShowCueOverflowMenu(false);
    }
  }, [effectiveCue]);
  const maxExtraHistorySlots = gridConfig.columns * 8; // support going back ~24 clips (8 rows)
  const maxForwardSlots = gridConfig.columns * 5;      // allow planning up to 5 extra rows forward (~13 clips at 3 cols)
  const historyReconciliationTargets = React.useMemo(
    () =>
      concepts.filter(
        (concept): concept is CustomerConcept =>
          concept.row_kind === 'assignment' && isStudioAssignedCustomerConcept(concept)
      ),
    [concepts]
  );
  const currentHistoryDefaultTarget = React.useMemo(
    () =>
      historyReconciliationTargets.find((concept) => concept.placement.feed_order === 0) ?? null,
    [historyReconciliationTargets]
  );
  const pendingPlacementTitle = React.useMemo(() => {
    if (!pendingPlacementConcept) return null;
    const details = getWorkspaceConceptDetails(pendingPlacementConcept, getConceptDetails) ?? null;
    return getWorkspaceConceptTitle(pendingPlacementConcept, details);
  }, [getConceptDetails, pendingPlacementConcept]);


  // Wheel scroll removed — the page now scrolls normally over the planner.
  // historyOffset is still set programmatically (e.g. "Granska historiken" button).

  // Threshold-based history fetch gate.
  // Fires onLoadMoreHistory (debounced 500 ms) when the visible planner bottom
  // is within one row of the deepest currently-loaded historik clip.
  // Never fires from inside a state mutation; runs as a separate effect.
  const loadMoreDebounceRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  React.useEffect(() => {
    // Always cancel any pending debounce before evaluating new conditions
    if (loadMoreDebounceRef.current !== null) {
      clearTimeout(loadMoreDebounceRef.current);
      loadMoreDebounceRef.current = null;
    }

    // Do nothing if there is no more data, a fetch is already running, or we
    // haven't scrolled into historik at all yet
    if (!historyHasMore || fetchingProfileHistory || historyOffset <= 0) return;

    // Deepest feed_order currently loaded (most-negative value, or 0 if none)
    const deepestLoadedOrder = concepts
      .map(c => c.placement.feed_order)
      .filter((v): v is number => typeof v === 'number' && v < 0)
      .reduce<number>((min, v) => Math.min(min, v), 0);

    if (deepestLoadedOrder === 0) return; // no historik rows in memory yet

    // feed_order of the bottom-right slot in the current window:
    //   feedOrder = currentSlotIndex − (totalSlots − 1) − historyOffset
    const visibleBottomFeedOrder =
      gridConfig.currentSlotIndex - (gridConfig.columns * gridConfig.rows - 1) - historyOffset;

    // Schedule fetch when the visible bottom is within one row of the loaded edge
    if (visibleBottomFeedOrder <= deepestLoadedOrder + gridConfig.columns) {
      loadMoreDebounceRef.current = setTimeout(() => {
        loadMoreDebounceRef.current = null;
        void onLoadMoreHistory(10);
      }, 500);
    }

    return () => {
      if (loadMoreDebounceRef.current !== null) {
        clearTimeout(loadMoreDebounceRef.current);
        loadMoreDebounceRef.current = null;
      }
    };
  }, [historyOffset, historyHasMore, fetchingProfileHistory, concepts, gridConfig, onLoadMoreHistory]);

  // Spans state
  const [spans, setSpans] = React.useState<FeedSpan[]>([]);
  const [spansHydrated, setSpansHydrated] = React.useState(false);
  const [drag, setDrag] = React.useState<{
    type: 'create' | 'start' | 'end' | 'climax';
    spanId?: string;
    a?: number;
    b?: number;
    colorIdx?: number;
  } | null>(null);
  const [hoveredSpan, setHoveredSpan] = React.useState<string | null>(null);
  const [activeSpan, setActiveSpan] = React.useState<string | null>(null);
  const [editingSpan, setEditingSpan] = React.useState<string | null>(null);
  const [editTitle, setEditTitle] = React.useState('');
  const [editBody, setEditBody] = React.useState('');
  const [nextColorIdx, setNextColorIdx] = React.useState(0);
  const [eelHovered, setEelHovered] = React.useState(false);
  const [editingPeriod, setEditingPeriod] = React.useState(false);
  const [showConceptPicker, setShowConceptPicker] = React.useState(false);
  const [showTempoModal, setShowTempoModal] = React.useState(false);
  const [slotAnchors, setSlotAnchors] = React.useState<Array<{
    yTop: number;
    yMid: number;
    yBot: number;
  }>>([]);
  const [animatedCount, setAnimatedCount] = React.useState(0);
  const spansCacheKey = React.useMemo(
    () => `studio-v2:workspace:${customerId}:feed-spans`,
    [customerId]
  );

  // Helper to get draft concepts
  const getDraftConcepts = React.useCallback(
    () =>
      concepts.filter(
        (concept) =>
          isStudioAssignedCustomerConcept(concept) &&
          concept.assignment.status === 'draft' &&
          concept.placement.feed_order === null
      ),
    [concepts]
  );

  // Frac offset: shifts span positions when grid is scrolled
  const totalSlots = gridConfig.columns * gridConfig.rows;
  const fracOffset = historyOffset / totalSlots;

  // Bygg slot-map
  const slotMap = React.useMemo(() =>
    buildSlotMap(
      concepts.filter((concept) => concept.placement.feed_order !== null),
      gridConfig,
      historyOffset
    ),
    [concepts, gridConfig, historyOffset]
  );
  const upwardOffset = historyOffset < 0 ? Math.abs(historyOffset) : 0;
  const downwardOffset = historyOffset > 0 ? historyOffset : 0;

  // Soft tempo projection — display-only, never written to DB.
  // Anchor: planned_publish_at on the current slot (feed_order=0) if it is in the
  // future, otherwise today. published_at is intentionally excluded — it is always
  // historical and would produce past projected dates for upcoming slots (E112).
  const tempoAnchor = React.useMemo(() => {
    const today = new Date();
    const nowConcept = concepts.find((c) => c.placement.feed_order === 0);
    if (nowConcept?.result?.planned_publish_at) {
      const d = new Date(nowConcept.result.planned_publish_at);
      return d > today ? d : today;
    }
    return today;
  }, [concepts]);

  const tempoDateMap = React.useMemo(() => {
    const map = new Map<number, Date>();
    for (const slot of slotMap) {
      if (slot.feedOrder > 0) {
        const d = projectTempoDate(slot.feedOrder, tempoAnchor, tempoWeekdays);
        if (d) map.set(slot.feedOrder, d);
      }
    }
    return map;
  }, [slotMap, tempoAnchor, tempoWeekdays]);
  /**
   * Position-based slot selection.
   *
   * Each row is divided into vertical zones, one per column:
   *   Top third    → col 0 (left)
   *   Middle third → col 1 (center)
   *   Bottom third → col 2 (right)
   *
   * A column is selected if the span overlaps its zone (with a small margin).
   * This means starting a drag near the bottom of a row selects the
   * rightmost clip first, which matches the chronological flow.
   */
  const touchedSlots = React.useCallback((span: FeedSpan, anchors: typeof slotAnchors) => {
    if (anchors.length === 0) return [];
    const cols = gridConfig.columns;
    const total = anchors[anchors.length - 1].yBot - anchors[0].yTop;
    if (total <= 0) return [];

    const viewStart = span.frac_start - fracOffset;
    const viewEnd = span.frac_end - fracOffset;
    if (viewEnd < 0 || viewStart > 1) return [];

    const result: Array<{ idx: number; coverage: number }> = [];

    const rowCount = Math.ceil(anchors.length / cols);
    for (let row = 0; row < rowCount; row++) {
      const rowStartIdx = row * cols;
      const rowEndIdx = Math.min(rowStartIdx + cols, anchors.length);
      if (rowStartIdx >= anchors.length) break;

      const rowTop = anchors[rowStartIdx].yTop;
      const rowBot = anchors[rowEndIdx - 1].yBot;
      const rowFracTop = (rowTop - anchors[0].yTop) / total;
      const rowFracBot = (rowBot - anchors[0].yTop) / total;
      const rowHeight = rowFracBot - rowFracTop;
      if (rowHeight <= 0) continue;

      // Does the span overlap this row at all?
      const overlapStart = Math.max(viewStart, rowFracTop);
      const overlapEnd = Math.min(viewEnd, rowFracBot);
      if (overlapEnd <= overlapStart) continue;

      const colsInRow = rowEndIdx - rowStartIdx;
      const zoneHeight = rowHeight / colsInRow;
      const margin = zoneHeight * 0.1; // 10% margin for easier selection

      for (let col = 0; col < colsInRow; col++) {
        const zoneTop = rowFracTop + col * zoneHeight + margin;
        const zoneBot = rowFracTop + (col + 1) * zoneHeight - margin;
        // Column is selected if the span overlaps its zone
        if (overlapEnd > zoneTop && overlapStart < zoneBot) {
          result.push({ idx: rowStartIdx + col, coverage: 1 });
        }
      }
    }

    return result;
  }, [gridConfig.columns, fracOffset]);

  // Load spans from API (cache-first + background refresh)
  React.useEffect(() => {
    const fetchSpans = async () => {
      if (!customerId) return;
      setSpansHydrated(false);

      try {
        const cached = readClientCache<FeedSpan[]>(spansCacheKey, {
          allowExpired: true,
          maxStaleMs: WORKSPACE_CACHE_MAX_STALE_MS
        });

        if (cached?.value) {
          setSpans(cached.value);
        }

        const spanData = await fetchAndCacheClient<FeedSpan[]>(
          spansCacheKey,
          async () => {
            const res = await fetch(`/api/studio-v2/feed-spans?customer_id=${customerId}`);
            const data = await res.json().catch(() => ({}));

            if (!res.ok) {
              throw new Error(data.error || `Failed to fetch spans (${res.status})`);
            }

            return Array.isArray(data.spans) ? data.spans as FeedSpan[] : [];
          },
          WORKSPACE_CACHE_TTL_MS,
          { force: Boolean(cached) }
        );

        setSpans(spanData);
      } catch (error) {
        console.error('Error fetching spans:', error);
      } finally {
        setSpansHydrated(true);
      }
    };

    void fetchSpans();
  }, [customerId, spansCacheKey]);

  React.useEffect(() => {
    if (!customerId || !spansHydrated) return;
    writeClientCache(spansCacheKey, spans, WORKSPACE_CACHE_TTL_MS);
  }, [customerId, spans, spansHydrated, spansCacheKey]);

  const reloadSpansFromServer = React.useCallback(async () => {
    if (!customerId) return;

    try {
      clearClientCache(spansCacheKey);
      const res = await fetch(`/api/studio-v2/feed-spans?customer_id=${customerId}`);
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data.error || `Failed to reload spans (${res.status})`);
      }

      const nextSpans = Array.isArray(data.spans) ? data.spans as FeedSpan[] : [];
      setSpans(nextSpans);
      writeClientCache(spansCacheKey, nextSpans, WORKSPACE_CACHE_TTL_MS);
    } catch (error) {
      console.error('Error reloading spans:', error);
    }
  }, [customerId, spansCacheKey]);

  // Measure slot positions
  React.useEffect(() => {
    if (!gridRef.current || slotMap.length === 0) return;

    const measureSlots = () => {
      const gridEl = gridRef.current;
      if (!gridEl) return;
      const gridRect = gridEl.getBoundingClientRect();
      const slots = gridEl.querySelectorAll('[data-slot-index]');

      const anchors = Array.from(slots).map((el) => {
        const rect = el.getBoundingClientRect();
        return {
          yTop: rect.top - gridRect.top,
          yMid: rect.top - gridRect.top + rect.height / 2,
          yBot: rect.bottom - gridRect.top
        };
      });

      setSlotAnchors(anchors);
    };

    measureSlots();

    const resizeObserver = new ResizeObserver(measureSlots);
    if (gridRef.current) {
      resizeObserver.observe(gridRef.current);
    }

    return () => resizeObserver.disconnect();
  }, [slotMap]);

  // Beräkna åliden när slots ändras
  React.useEffect(() => {
    if (!gridRef.current || slotMap.length === 0) return;

    const updateEel = () => {
      const centers = calculateSlotCenters(gridRef.current as HTMLDivElement);
      if (centers.length > 0) {
        const path = buildCurvePath(centers);
        const segments = buildSegmentPaths(centers);
        const gradients = buildGradients(slotMap, cmTags);
        const gradientsWithPos = updateGradientPositions(gradients, centers);
        setEelPath(path);
        setEelSegments(segments);
        setEelGradients(gradientsWithPos);
      }
    };

    // Initial calculation
    updateEel();

    // Recalculate on resize
    const resizeObserver = new ResizeObserver(updateEel);
    if (gridRef.current) {
      resizeObserver.observe(gridRef.current);
    }

    return () => resizeObserver.disconnect();
  }, [slotMap, gridConfig, cmTags]);

  const fracToY = React.useCallback((frac: number, anchors: typeof slotAnchors) => {
    return spanFracToY(frac, anchors);
  }, []);

  // Ref-based span handlers - avoids stale closures and listener churn
  const getGridElement = React.useCallback(() => gridRef.current, []);
  const spanHandlerRefs = React.useRef<SpanHandlerRefs>({
    spans, slotAnchors, drag, activeSpan, nextColorIdx, fracOffset, reloadSpans: reloadSpansFromServer
  });
  // Keep refs in sync
  spanHandlerRefs.current = { spans, slotAnchors, drag, activeSpan, nextColorIdx, fracOffset, reloadSpans: reloadSpansFromServer };

  const stableHandlers = React.useMemo(
    () =>
      createSpanHandlers(
        getGridElement,
        spanHandlerRefs,
        setDrag,
        setSpans,
        setActiveSpan,
        setHoveredSpan,
        setEditingSpan,
        setEditTitle,
        setEditBody,
        setNextColorIdx,
        customerId
      ),
    // Only recreate when customerId changes (stable identity otherwise)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [customerId]
  );

  const onEelDown = React.useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      stableHandlers.onEelDown(e);
    },
    [stableHandlers]
  );

  // Stable event listeners - no churn on drag/spans state changes
  React.useEffect(() => {
    const onMove = (e: MouseEvent) => stableHandlers.onMove(e);
    const onUp = () => { stableHandlers.onUp(); };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);

    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [stableHandlers]);

  const visSpan = activeSpan || hoveredSpan;
  const visSpanData = React.useMemo(
    () => spans.find((span) => span.id === visSpan) ?? null,
    [spans, visSpan]
  );
  // Calculate which slots are selected — includes in-progress drag as a virtual span
  const allSpansCoverage = React.useMemo(() => {
    if (slotAnchors.length === 0) return new Map<number, { coverage: number; color: string }>();

    const coverageMap = new Map<number, { coverage: number; color: string }>();

    // Build list: persisted spans + in-progress drag (as virtual span)
    const spansToCheck: Array<{ span: FeedSpan | null; frac_start: number; frac_end: number; color: string }> = [];

    spans.forEach((span) => {
      const color = SPAN_COLOR_PALETTE[
        ((span.color_index % SPAN_COLOR_PALETTE.length) + SPAN_COLOR_PALETTE.length) %
          SPAN_COLOR_PALETTE.length
      ].color;
      spansToCheck.push({ span, frac_start: span.frac_start, frac_end: span.frac_end, color });
    });

    // Add drag-in-progress as virtual span (view-space → global-space)
    if (drag?.type === 'create' && drag.a !== undefined && drag.b !== undefined) {
      const a = Math.min(drag.a, drag.b) + fracOffset;
      const b = Math.max(drag.a, drag.b) + fracOffset;
      if (b - a > 0.01) {
        const color = SPAN_COLOR_PALETTE[drag.colorIdx || 0].color;
        spansToCheck.push({ span: null, frac_start: a, frac_end: b, color });
      }
    }

    spansToCheck.forEach(({ frac_start, frac_end, color }) => {
      const virtualSpan = { frac_start, frac_end } as FeedSpan;
      const touched = touchedSlots(virtualSpan, slotAnchors);
      touched.forEach(({ idx, coverage }) => {
        const existing = coverageMap.get(idx);
        if (!existing || coverage > existing.coverage) {
          coverageMap.set(idx, { coverage, color });
        }
      });
    });

    return coverageMap;
  }, [spans, slotAnchors, touchedSlots, drag, fracOffset]);

  // Reset period edit mode when a different span is opened
  React.useEffect(() => { setEditingPeriod(false); }, [editingSpan]);

  const animatedCountRef = React.useRef(0);
  React.useEffect(() => {
    animatedCountRef.current = animatedCount;
  }, [animatedCount]);

  // Auto-save title/body if dirty when the edit panel is closed or a different span is opened.
  // Fire-and-forget: optimistic local update first, PATCH async, reload on failure.
  const saveCurrentSpanTextIfDirty = React.useCallback(async () => {
    if (!editingSpan) return;
    const span = spans.find((s) => s.id === editingSpan);
    if (!span) return;
    if (editTitle === span.title && editBody === span.body) return;
    setSpans((prev) =>
      prev.map((s) => s.id === editingSpan ? { ...s, title: editTitle, body: editBody } : s)
    );
    try {
      const res = await fetch(`/api/studio-v2/feed-spans/${editingSpan}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: editTitle, body: editBody }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `PATCH failed (${res.status})`);
      }
    } catch (err) {
      console.error('[åliden] auto-save title/body failed:', err);
      void reloadSpansFromServer();
    }
  }, [editingSpan, editTitle, editBody, spans, reloadSpansFromServer]);

  React.useEffect(() => {
    const countSpan = editingSpan
      ? spans.find((span) => span.id === editingSpan) ?? null
      : visSpanData;

    if (!countSpan || slotAnchors.length === 0) {
      setAnimatedCount(0);
      return;
    }

    const targetCount = touchedSlots(countSpan, slotAnchors).length;
    const startCount = animatedCountRef.current;
    if (startCount === targetCount) return;

    const duration = 200;
    const start = performance.now();
    let frameId = 0;

    const animate = (now: number) => {
      const progress = Math.min((now - start) / duration, 1);
      const value = Math.round(startCount + (targetCount - startCount) * progress);
      setAnimatedCount(value);
      if (progress < 1) {
        frameId = requestAnimationFrame(animate);
      }
    };

    frameId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frameId);
  }, [editingSpan, spans, visSpanData, slotAnchors, touchedSlots]);

  // Y position of the edit panel — centered at the editing span's visual midpoint
  const editPanelY = React.useMemo(() => {
    if (!editingSpan) return null;
    const span = spans.find(s => s.id === editingSpan);
    if (!span) return null;
    if (slotAnchors.length === 0) return 200; // fallback before grid is measured
    const midFrac = (span.frac_start + span.frac_end) / 2 - fracOffset;
    const clampedMid = Math.max(0.05, Math.min(0.95, midFrac));
    return fracToY(clampedMid, slotAnchors);
  }, [editingSpan, spans, slotAnchors, fracOffset, fracToY]);

  // True when there are no LeTrend concepts with a feed_order (empty feed state, Task 8)
  const hasNoConcepts = !concepts.some(
    (c) => c.row_kind === 'assignment' && typeof c.placement.feed_order === 'number'
  );

  // True when at least one LeTrend-managed concept is placed in nu (0) or kommande (>0).
  // Used both in the toolbar header (standalone advance affordance) and in the cue block.
  const hasActivePlan = concepts.some(
    (c) =>
      c.row_kind === 'assignment' &&
      typeof c.placement.feed_order === 'number' &&
      c.placement.feed_order >= 0
  );

  // The LeTrend concept currently at nu (feed_order === 0), if any.
  // Only derived for fresh_activity signals — backfill does not imply a LeTrend concept was produced.
  // Used in the motor cue to bridge external publication evidence with the internal production path.
  const nuConcept =
    effectiveCue?.kind === 'fresh_activity'
      ? (concepts.find(
          (c) => c.row_kind === 'assignment' && c.placement.feed_order === 0
        ) ?? null)
      : null;

  // Derive the ordered list and ID-set of imported-history clips that constitute fresh evidence
  // for the current motor cue. Both the cue glimpse and the historik highlight use the same source
  // so the CM always sees the same evidence in both surfaces.
  //
  // Primary path: any imported clip with published_at >= pending_history_advance_published_at
  //   (the seam stored by the sync engine for the triggering batch).
  // Fallback: when no seam is available, the N most-recent imported clips (N = signal count).
  // Conservative: only rows present in memory. Never invents a match.
  const { freshImportedConcepts, freshImportedIds } = React.useMemo(() => {
    if (!effectiveCue) return { freshImportedConcepts: [] as typeof concepts, freshImportedIds: new Set<string>() as ReadonlySet<string> };
    const imported = concepts
      .filter(c => c.row_kind === 'imported_history')
      .sort((a, b) => {
        const tA = a.result.published_at ? new Date(a.result.published_at).getTime() : 0;
        const tB = b.result.published_at ? new Date(b.result.published_at).getTime() : 0;
        return tB - tA; // newest first
      });
    let fresh: typeof imported;
    if (effectiveCue.publishedAt) {
      const seam = new Date(effectiveCue.publishedAt).getTime();
      fresh = imported.filter(c => c.result.published_at ? new Date(c.result.published_at).getTime() >= seam : false);
    } else {
      // No seam: fall back to the N most-recent imported clips where N = imported signal count
      fresh = imported.slice(0, effectiveCue.imported);
    }
    return {
      freshImportedConcepts: fresh,
      freshImportedIds: new Set(fresh.map(c => c.id)) as ReadonlySet<string>,
    };
  }, [effectiveCue, concepts]);

  return (
    <>
      <TempoModal
        isOpen={showTempoModal}
        tempoWeekdays={tempoWeekdays}
        onClose={() => setShowTempoModal(false)}
        onTempoWeekdaysChange={onTempoWeekdaysChange}
      />
      {pendingPlacementConcept ? (
        <div
          style={{
            marginBottom: 14,
            padding: '12px 14px',
            borderRadius: LeTrendRadius.md,
            background: '#ecfeff',
            border: '1px solid #a5f3fc',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            flexWrap: 'wrap',
          }}
        >
          <div style={{ fontSize: 12, color: '#155e75', lineHeight: 1.6 }}>
            <strong>Placering paborjad:</strong> valj en tom kommande slot for att placera konceptet i planen.
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span
              style={{
                padding: '5px 9px',
                borderRadius: 999,
                background: '#fff',
                border: '1px solid #a5f3fc',
                fontSize: 12,
                color: '#155e75',
                fontWeight: 700,
              }}
            >
              {pendingPlacementTitle ?? pendingPlacementConcept.id}
            </span>
            <button
              type="button"
              onClick={() => onCancelPendingPlacement?.()}
              style={{
                border: 'none',
                background: 'transparent',
                color: '#155e75',
                fontSize: 12,
                fontWeight: 700,
                cursor: 'pointer',
                textDecoration: 'underline',
                textUnderlineOffset: 2,
              }}
            >
              Avbryt
            </button>
          </div>
        </div>
      ) : null}
      <div style={{
        background: LeTrendColors.cream,
        borderRadius: LeTrendRadius.lg,
        padding: 24,
        border: `1px solid ${LeTrendColors.border}`
      }}>
      {/* Header med Hantera taggar-länk */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h2 style={{
          fontSize: 22,
          fontWeight: 700,
          color: LeTrendColors.brownDark,
          margin: 0
        }}>
          Feed-planerare
        </h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {hasActivePlan && (
            <button
              onClick={() => void onAdvancePlan()}
              disabled={advancingPlan}
              style={{
                background: 'none',
                border: '1px solid #9ca3af',
                borderRadius: LeTrendRadius.md,
                fontSize: 12,
                color: '#4b5563',
                cursor: advancingPlan ? 'not-allowed' : 'pointer',
                padding: '3px 10px',
                fontWeight: 400,
              }}
            >
              {advancingPlan ? 'Flyttar...' : 'Flytta planen framåt'}
            </button>
          )}
          <button
            onClick={() => setShowTagManager(true)}
            style={{
              background: 'none',
              border: 'none',
              color: LeTrendColors.brownLight,
              fontSize: 14,
              fontWeight: 600,
              cursor: 'pointer',
              textDecoration: 'underline'
            }}
          >
            Hantera taggar
          </button>
        </div>
      </div>

      {/* History controls removed from planner surface — auto-loads on workspace open;
          manual import/fetch available in the Demo-förberedelse tab */}

      {/* Rytm: compact summary trigger — opens TempoModal for full picker */}
      {(() => {
        const tempoSortedKey = [...tempoWeekdays].sort().join(',');
        const matchedPreset = TEMPO_PRESETS.find(
          (p) => [...p.weekdays].sort().join(',') === tempoSortedKey
        );
        const DAY_LABELS = ['Mån','Tis','Ons','Tor','Fre','Lör','Sön'];
        const tempoLabel = tempoWeekdays.length === 0
          ? 'Ingen rytm'
          : matchedPreset
            ? matchedPreset.label
            : tempoWeekdays.map((d) => DAY_LABELS[d]).join(' · ');
        return (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 14 }}>
            <span style={{ fontSize: 11, color: LeTrendColors.textMuted, fontWeight: 500 }}>Rytm:</span>
            <button
              onClick={() => setShowTempoModal(true)}
              style={{
                padding: '2px 10px',
                borderRadius: 999,
                border: `1px solid ${isTempoExplicit ? LeTrendColors.brownLight : LeTrendColors.border}`,
                background: isTempoExplicit ? LeTrendColors.brownLight : 'transparent',
                color: isTempoExplicit ? 'white' : LeTrendColors.textMuted,
                fontSize: 11,
                fontWeight: isTempoExplicit ? 500 : 400,
                cursor: 'pointer',
                opacity: isTempoExplicit ? 1 : 0.65,
              }}
            >
              {isTempoExplicit ? tempoLabel : `${tempoLabel} (standard)`}
            </button>
          </div>
        );
      })()}

      {/* TempoModal — preset + free-form weekday picker */}
      {/* Legacy TempoModal extracted to ./TempoModal */}
      {/* Advancement cue — shown when new clips appear in the customer's historik.
          Driven by feed_motor_signals (activeNudges) if available; falls back to legacy
          pendingAdvanceCue for customers whose signals pre-date the migration.
          Hidden when deferredAdvanceCue is true (session-local only, no backend write). */}
      {effectiveCue && !deferredAdvanceCue && (
        <FeedAdvanceCue
          cue={effectiveCue}
          cueSignalId={activeNudges[0]?.id}
          activeNudgesCount={activeNudges.length}
          hasActivePlan={hasActivePlan}
          nuConcept={nuConcept}
          freshImportedConcepts={freshImportedConcepts}
          freshImportedIds={freshImportedIds}
          focusedEvidenceCount={focusedEvidenceIds.size}
          advancingPlan={advancingPlan}
          markingProducedFromCue={markingProducedFromCue}
          showCueOverflowMenu={showCueOverflowMenu}
          onReviewHistory={() => {
            setHistoryOffset(gridConfig.columns);
            setFocusedEvidenceIds(freshImportedIds);
          }}
          onDefer={() => {
            setDeferredAdvanceCue(true);
            setShowCueOverflowMenu(false);
          }}
          onToggleOverflow={() => setShowCueOverflowMenu((current) => !current)}
          onMarkProducedFromCue={() => {
            void (async () => {
              setMarkingProducedFromCue(true);
              setShowCueOverflowMenu(false);
              try {
                const linkClip = freshImportedConcepts.length > 0 ? freshImportedConcepts[0] : null;
                await handleMarkProduced(
                  nuConcept!.id,
                  linkClip?.result.tiktok_url ?? undefined,
                  linkClip?.result.published_at ?? undefined,
                );
                onDismissAdvanceCue(activeNudges[0]?.id);
              } finally {
                setMarkingProducedFromCue(false);
              }
            })();
          }}
          onAdvancePlan={() => {
            setShowCueOverflowMenu(false);
            void onAdvancePlan();
          }}
          onDismissCue={onDismissAdvanceCue}
          formatCompactViews={formatCompactViews}
        />
      )}
      {false && effectiveCue && !deferredAdvanceCue && (
        <div style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: 10,
          marginBottom: 16,
          padding: '10px 14px',
          background: '#f0fdf4',
          border: '1px solid #bbf7d0',
          borderRadius: LeTrendRadius.md,
          fontSize: 13,
        }}>
          {(() => {
            return (
              <>
          <div style={{ flex: 1 }}>
            <div style={{ color: '#166534', fontWeight: 600 }}>
              {effectiveCue!.kind === 'fresh_activity'
                ? `${effectiveCue!.imported} nya klipp i historiken`
                : `${effectiveCue!.imported} historiska klipp importerade`}
              {activeNudges.length > 1 && (
                <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 500, color: '#166534', opacity: 0.65 }}>
                  +{activeNudges.length - 1} fler
                </span>
              )}
            </div>
            <div style={{ color: '#166534', fontSize: 11, opacity: 0.75, marginTop: 2 }}>
              {effectiveCue!.kind === 'fresh_activity'
                ? (nuConcept
                    ? 'Var det nu-konceptet som publicerades?'
                    : (hasActivePlan
                        ? 'Kunden publicerade nytt – granska historiken och flytta planen om det stämmer.'
                        : 'Placera ett koncept i planen för att kunna flytta framåt.'))
                : (hasActivePlan
                    ? 'Äldre innehåll – granska historiken innan du flyttar planen.'
                    : 'Äldre innehåll importerat till historiken.')}
            </div>
            {/* Nu-concept reference — shows the active nu concept when the signal is fresh_activity.
                Bridges the external evidence (imported clips) with the LeTrend production path. */}
            {nuConcept && (
              <div style={{ marginTop: 6, fontSize: 11, color: '#166534', opacity: 0.8 }}>
                Nu: <span style={{ fontWeight: 600 }}>
                  {nuConcept!.content.content_overrides?.headline ?? 'Aktivt koncept'}
                </span>
              </div>
            )}
            {/* History glimpse — the same fresh-evidence set that will be highlighted in historik.
                Uses freshImportedConcepts (same derivation as focusedEvidenceIds) so glimpse
                and historik highlight always show the same clips. */}
            {freshImportedConcepts.length > 0 && (() => {
              const glimpse = freshImportedConcepts.slice(0, 3);
              return (
                <>
                  <div style={{ fontSize: 10, color: '#166534', opacity: 0.55, marginTop: 8, marginBottom: 3, fontWeight: 600, letterSpacing: '0.03em' }}>
                    {freshImportedConcepts.length} {freshImportedConcepts.length === 1 ? 'nytt klipp' : 'nya klipp'}
                    {freshImportedConcepts.length > 3 ? ` · visar ${glimpse.length}` : ''}
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {glimpse.map((clip) => {
                      const caption = clip.content.content_overrides?.script ?? null;
                      const date = clip.result.published_at
                        ? new Date(clip.result.published_at).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' })
                        : null;
                      return (
                        <div
                          key={clip.id}
                          style={{
                            display: 'flex',
                            gap: 5,
                            alignItems: 'flex-start',
                            flex: 1,
                            minWidth: 0,
                            background: 'rgba(255,255,255,0.55)',
                            borderRadius: LeTrendRadius.sm,
                            padding: '5px 6px',
                          }}
                        >
                          {clip.result.tiktok_thumbnail_url && (
                            <img
                              src={clip.result.tiktok_thumbnail_url}
                              alt=""
                              style={{ width: 20, height: 35, objectFit: 'cover', borderRadius: 2, flexShrink: 0 }}
                            />
                          )}
                          <div style={{ minWidth: 0, flex: 1 }}>
                            {caption && (
                              <div style={{
                                fontSize: 10,
                                color: '#166534',
                                opacity: 0.85,
                                overflow: 'hidden',
                                whiteSpace: 'nowrap',
                                textOverflow: 'ellipsis',
                                lineHeight: 1.3,
                                marginBottom: 2,
                              }}>
                                {caption}
                              </div>
                            )}
                            <div style={{ fontSize: 10, color: '#166534', opacity: 0.6, lineHeight: 1.3 }}>
                              {date ?? '—'}
                              {clip.result.tiktok_views && clip.result.tiktok_views > 0
                                ? ` · ${formatCompactViews(clip.result.tiktok_views)}`
                                : ''}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              );
            })()}
            {/* Tertiary cue actions — no backend writes, purely local navigation aids.
                Granska: scrolls the grid into historik and marks the same fresh-evidence clips
                         shown in the glimpse above — so the CM can review them in context.
                Inte nu: defers the cue locally for this session without acknowledging the signal. */}
            <div style={{ display: 'flex', gap: 8, marginTop: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <button
                onClick={() => {
                  setHistoryOffset(gridConfig.columns);
                  setFocusedEvidenceIds(freshImportedIds);
                }}
                style={{
                  background: 'none', border: 'none', fontSize: 11,
                  color: '#166534', opacity: 0.75, cursor: 'pointer',
                  padding: 0, textDecoration: 'underline', textUnderlineOffset: 2,
                }}
              >
                {freshImportedIds.size > 0
                  ? `Granska ${freshImportedIds.size} klipp i historiken`
                  : 'Granska historiken'}
              </button>
              {/* Post-click confirmation: appears once focusedEvidenceIds is set */}
              {focusedEvidenceIds.size > 0 && (
                <span style={{ fontSize: 10, color: '#166534', opacity: 0.5 }}>
                  ↓ markerade nedan
                </span>
              )}
              <span style={{ fontSize: 10, color: '#166534', opacity: 0.35 }}>·</span>
              <button
                onClick={() => {
                  setDeferredAdvanceCue(true);
                  setShowCueOverflowMenu(false);
                }}
                style={{
                  background: 'none', border: 'none', fontSize: 11,
                  color: '#6b7280', opacity: 0.75, cursor: 'pointer',
                  padding: 0, textDecoration: 'underline', textUnderlineOffset: 2,
                }}
              >
                Inte nu
              </button>
            </div>
          </div>
          {nuConcept ? (
            // fresh_activity + nu concept exists: offer Markera och flytta as primary,
            // Flytta utan länk as secondary (advance without closing the concept cycle / without linking URL)
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5, alignItems: 'flex-end', position: 'relative' }}>
              <button
                onClick={() => {
                  void (async () => {
                    setMarkingProducedFromCue(true);
                    setShowCueOverflowMenu(false);
                    try {
                      // If fresh evidence clips are present, attach the newest clip's TikTok URL.
                      // The CM has already reviewed these clips in the glimpse above — linking the
                      // freshest one closes the concept cycle with real publication proof.
                      const linkClip = freshImportedConcepts.length > 0 ? freshImportedConcepts[0] : null;
                      await handleMarkProduced(
                        nuConcept!.id,
                        linkClip?.result.tiktok_url ?? undefined,
                        linkClip?.result.published_at ?? undefined,
                      );
                      onDismissAdvanceCue(activeNudges[0]?.id); // consume motor signal (acknowledge) and clear local cue
                    } finally {
                      setMarkingProducedFromCue(false);
                    }
                  })();
                }}
                disabled={markingProducedFromCue || advancingPlan}
                style={{
                  padding: '5px 12px',
                  background: '#16a34a',
                  border: 'none',
                  borderRadius: LeTrendRadius.md,
                  fontSize: 12,
                  fontWeight: 600,
                  color: '#fff',
                  cursor: markingProducedFromCue || advancingPlan ? 'not-allowed' : 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
                {markingProducedFromCue ? 'Markerar...' : 'Markera och flytta'}
              </button>
              <div style={{ fontSize: 10, color: '#166534', opacity: 0.6, textAlign: 'right', maxWidth: 220 }}>
                Kopplar senaste klippet till nu-konceptet och flyttar planen framåt.
              </div>
              {/* Inline signal: shows which clip will be linked when CM confirms.
                  Only rendered when the freshest clip has a URL (no URL = no link label). */}
              {freshImportedConcepts.length > 0 && freshImportedConcepts[0].result.tiktok_url && (
                <div style={{ fontSize: 10, color: '#166534', opacity: 0.55, textAlign: 'right' }}>
                  {'↑ länkar klippet'}
                  {freshImportedConcepts[0].result.published_at
                    ? ` · ${new Date(freshImportedConcepts[0].result.published_at!).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' })}`
                    : ''}
                </div>
              )}
              <button
                type="button"
                onClick={() => setShowCueOverflowMenu((current) => !current)}
                disabled={advancingPlan || markingProducedFromCue}
                aria-label="Fler val"
                style={{
                  width: 28,
                  height: 28,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: '#fff',
                  border: '1px solid #9ca3af',
                  borderRadius: LeTrendRadius.md,
                  fontSize: 15,
                  fontWeight: 700,
                  color: '#4b5563',
                  cursor: advancingPlan || markingProducedFromCue ? 'not-allowed' : 'pointer',
                }}
              >
                ⋯
              </button>
              {showCueOverflowMenu ? (
                <div
                  style={{
                    position: 'absolute',
                    top: '100%',
                    right: 0,
                    marginTop: 6,
                    minWidth: 210,
                    padding: 6,
                    background: '#fff',
                    border: `1px solid ${LeTrendColors.border}`,
                    borderRadius: LeTrendRadius.md,
                    boxShadow: '0 8px 24px rgba(15, 23, 42, 0.12)',
                    zIndex: 4,
                  }}
                >
                  <button
                    type="button"
                    onClick={() => {
                      setShowCueOverflowMenu(false);
                      void onAdvancePlan();
                    }}
                    disabled={advancingPlan || markingProducedFromCue}
                    style={{
                      width: '100%',
                      textAlign: 'left',
                      padding: '8px 10px',
                      border: 'none',
                      background: 'transparent',
                      borderRadius: LeTrendRadius.sm,
                      fontSize: 12,
                      color: '#4b5563',
                      cursor: advancingPlan || markingProducedFromCue ? 'not-allowed' : 'pointer',
                    }}
                  >
                    Flytta utan att koppla klipp
                  </button>
                </div>
              ) : null}
            </div>
          ) : hasActivePlan ? (
            // No nu concept (only kommande) or backfill: keep existing advance-only CTA
            <button
              onClick={() => void onAdvancePlan()}
              disabled={advancingPlan}
              style={effectiveCue!.kind === 'fresh_activity' ? {
                padding: '5px 12px',
                background: '#16a34a',
                border: 'none',
                borderRadius: LeTrendRadius.md,
                fontSize: 12,
                fontWeight: 600,
                color: '#fff',
                cursor: advancingPlan ? 'not-allowed' : 'pointer',
                whiteSpace: 'nowrap',
              } : {
                padding: '5px 12px',
                background: 'none',
                border: '1px solid #9ca3af',
                borderRadius: LeTrendRadius.md,
                fontSize: 12,
                fontWeight: 400,
                color: '#4b5563',
                cursor: advancingPlan ? 'not-allowed' : 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              {advancingPlan ? 'Flyttar...' : 'Flytta planen framåt'}
            </button>
          ) : (
            <span style={{ fontSize: 11, color: '#6b7280', whiteSpace: 'nowrap', paddingTop: 3 }}>
              Inget kommande i planen
            </span>
          )}
          <button
            onClick={() => onDismissAdvanceCue(activeNudges[0]?.id)}
            style={{
              background: 'none',
              border: 'none',
              fontSize: 16,
              cursor: 'pointer',
              color: '#6b7280',
              padding: '0 2px',
            }}
          >
            ×
          </button>
        </>
      );
    })()}
        </div>
      )}

      {/* Auto-resolved nudge badge — cron advanced the plan automatically; informational only.
          Disappears permanently when CM clicks Stäng (sets acknowledged_at on all rows). */}
      {autoResolvedNudges.length > 0 && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          marginBottom: 10,
          padding: '6px 12px',
          background: LeTrendColors.surface,
          border: `1px solid ${LeTrendColors.border}`,
          borderRadius: LeTrendRadius.sm,
          fontSize: 11,
          color: LeTrendColors.textSecondary,
        }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ color: '#16a34a', fontWeight: 600 }}>✓</span>
            Autopilot hanterade {autoResolvedNudges.length} framflyttning{autoResolvedNudges.length > 1 ? 'ar' : ''} automatiskt
          </span>
          <button
            onClick={onDismissAutoResolvedSignals}
            style={{
              background: 'none',
              border: 'none',
              fontSize: 11,
              color: LeTrendColors.textMuted,
              cursor: 'pointer',
              padding: 0,
              flexShrink: 0,
            }}
          >
            Stäng
          </button>
        </div>
      )}

      {/* Deferred cue indicator — visible when CM clicked "Inte nu" and has not entered review mode.
          Reminds them the motor signal is still pending and will return on next page load.
          Keeps "I have deferred the cue" distinguishable from "cue resolved" or "reviewing". */}
      {effectiveCue && deferredAdvanceCue && focusedEvidenceIds.size === 0 && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          marginBottom: 12,
          padding: '5px 10px',
          background: 'rgba(107,114,128,0.06)',
          border: '1px solid rgba(107,114,128,0.18)',
          borderRadius: LeTrendRadius.sm,
          fontSize: 11,
          color: '#6b7280',
        }}>
          <span style={{ opacity: 0.8 }}>
            Signal pausad – återkommer vid nästa inläsning
            <span style={{ opacity: 0.6, marginLeft: 4 }}>
              ({effectiveCue!.imported} {effectiveCue!.kind === 'fresh_activity' ? 'nya' : 'historiska'} klipp)
            </span>
          </span>
          <button
            onClick={() => setDeferredAdvanceCue(false)}
            style={{
              background: 'none', border: 'none', fontSize: 11,
              color: '#6b7280', cursor: 'pointer', padding: 0,
              textDecoration: 'underline', textUnderlineOffset: 2, whiteSpace: 'nowrap', flexShrink: 0,
            }}
          >
            Återuppta
          </button>
        </div>
      )}

      {/* Koncept-väljare dropdown */}
      <DraftConceptPicker
        drafts={getDraftConcepts()}
        showConceptPicker={showConceptPicker}
        onToggle={() => setShowConceptPicker(!showConceptPicker)}
        getConceptDetails={getConceptDetails}
      />
      {/* Granskningsläge-banner — visible when CM is reviewing fresh evidence in historik.
          Self-sufficient: shows signal context and kind even when the cue block is not visible
          (e.g. cue deferred). Includes a re-open path when the cue has been deferred.
          Dismissable: × clears focusedEvidenceIds without resolving the cue. */}
      {focusedEvidenceIds.size > 0 && effectiveCue && (
        <FeedReviewBanner
          cueKind={effectiveCue.kind}
          focusedEvidenceCount={focusedEvidenceIds.size}
          deferredAdvanceCue={deferredAdvanceCue}
          onResumeCue={() => setDeferredAdvanceCue(false)}
          onClose={() => setFocusedEvidenceIds(new Set())}
        />
      )}
      {false && focusedEvidenceIds.size > 0 && effectiveCue && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          marginBottom: 6,
          padding: '5px 10px',
          background: 'rgba(22,101,52,0.06)',
          border: '1px solid rgba(22,101,52,0.18)',
          borderRadius: LeTrendRadius.sm,
          fontSize: 11,
          color: '#166534',
        }}>
          <span style={{ opacity: 0.75, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <span>
              Granskningsläge
              {' · '}
              {focusedEvidenceIds.size} {effectiveCue?.kind === 'fresh_activity' ? 'nya' : 'historiska'} klipp markerade med <strong style={{ fontWeight: 700 }}>nytt</strong>
            </span>
            {/* When cue is deferred: signal the deferred state and offer to re-open the cue */}
            {deferredAdvanceCue && (
              <>
                <span style={{ opacity: 0.4 }}>·</span>
                <span style={{ opacity: 0.6 }}>signal pausad</span>
                <button
                  onClick={() => setDeferredAdvanceCue(false)}
                  style={{
                    background: 'none', border: 'none', fontSize: 11,
                    color: '#166534', cursor: 'pointer', padding: 0,
                    textDecoration: 'underline', textUnderlineOffset: 2,
                  }}
                >
                  Återuppta
                </button>
              </>
            )}
          </span>
          <button
            onClick={() => setFocusedEvidenceIds(new Set())}
            style={{
              background: 'none', border: 'none', fontSize: 13, lineHeight: 1,
              color: '#166534', opacity: 0.45, cursor: 'pointer', padding: 0, flexShrink: 0,
            }}
            title="Stäng granskningsläge"
          >
            ×
          </button>
        </div>
      )}

      {/* Grid med Åliden till vänster */}
      <div ref={gridWrapperRef} style={{ position: 'relative', paddingLeft: 70 }}>
        {/* Åliden SVG - till vänster om grid via padding */}
        {eelPath && (
          <svg
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: 60,
              height: '100%',
              pointerEvents: 'all',
              zIndex: 3,
              overflow: 'visible',
              cursor: drag?.type === 'create' ? 'ns-resize' : 'crosshair',
              opacity: eelHovered || editingSpan || drag ? 1 : 0.35,
              transition: 'opacity 0.2s ease'
            }}
            onMouseDown={onEelDown}
            onMouseEnter={() => setEelHovered(true)}
            onMouseLeave={() => {
              setEelHovered(false);
              if (!drag) setHoveredSpan(null);
            }}
          >
            <defs>
              {/* Glow filter for spans */}
              <filter id="glow-span">
                <feGaussianBlur stdDeviation="3" result="b" />
                <feMerge>
                  <feMergeNode in="b" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>

              {/* Gradients for tags */}
              {eelGradients.map((grad, i) => (
                <linearGradient key={i} id={grad.id} {...grad.attrs}>
                  <stop offset="0%" stopColor={grad.fromColor} />
                  <stop offset="100%" stopColor={grad.toColor} />
                </linearGradient>
              ))}

              {/* Gradients for spans (shifted by fracOffset for scroll) */}
              {spans.map((span) => {
                const viewStart = span.frac_start - fracOffset;
                const viewEnd = span.frac_end - fracOffset;
                // Skip if entirely out of view
                if (viewEnd < -0.1 || viewStart > 1.1) return null;
                const yStart = fracToY(Math.max(0, viewStart), slotAnchors);
                const yEnd = fracToY(Math.min(1, viewEnd), slotAnchors);
                const col = SPAN_COLOR_PALETTE[span.color_index].color;
                return (
                  <linearGradient
                    key={`span-grad-${span.id}`}
                    id={`span-grad-${span.id}`}
                    x1={0}
                    y1={yStart}
                    x2={0}
                    y2={yEnd}
                    gradientUnits="userSpaceOnUse"
                  >
                    <stop offset="0%" stopColor={col} stopOpacity={viewStart < 0 ? 0.85 : 0.08} />
                    <stop offset="18%" stopColor={col} stopOpacity={0.85} />
                    <stop offset="82%" stopColor={col} stopOpacity={0.85} />
                    <stop offset="100%" stopColor={col} stopOpacity={viewEnd > 1 ? 0.85 : 0.08} />
                  </linearGradient>
                );
              }).filter(Boolean)}

              {/* Gradient for drag creation (already in view-space since drag uses grid coords) */}
              {drag?.type === 'create' &&
                drag.a !== undefined &&
                drag.b !== undefined &&
                (() => {
                  const yA = fracToY(Math.max(0, Math.min(drag.a, drag.b)), slotAnchors);
                  const yB = fracToY(Math.min(1, Math.max(drag.a, drag.b)), slotAnchors);
                  const col = SPAN_COLOR_PALETTE[drag.colorIdx || 0].color;
                  return (
                    <linearGradient
                      id="span-drag-grad"
                      x1={0}
                      y1={yA}
                      x2={0}
                      y2={yB}
                      gradientUnits="userSpaceOnUse"
                    >
                      <stop offset="0%" stopColor={col} stopOpacity={0.05} />
                      <stop offset="25%" stopColor={col} stopOpacity={0.65} />
                      <stop offset="75%" stopColor={col} stopOpacity={0.65} />
                      <stop offset="100%" stopColor={col} stopOpacity={0.05} />
                    </linearGradient>
                  );
                })()}
            </defs>

            {/* Render spans (positions shifted by fracOffset for scroll) */}
            {slotAnchors.length > 0 &&
              spans.map((span) => {
                const viewStart = span.frac_start - fracOffset;
                const viewEnd = span.frac_end - fracOffset;
                // Skip spans entirely outside visible area
                if (viewEnd < -0.05 || viewStart > 1.05) return null;
                const clampedStart = Math.max(0, viewStart);
                const clampedEnd = Math.min(1, viewEnd);
                const yStart = fracToY(clampedStart, slotAnchors);
                const yEnd = fracToY(clampedEnd, slotAnchors);
                const yMid = (yStart + yEnd) / 2;
                const col = SPAN_COLOR_PALETTE[span.color_index].color;
                const isVis = visSpan === span.id;

                return (
                  <g key={`span-${span.id}`}>
                    {/* Glow effect when hovered/active */}
                    {isVis && (
                      <line
                        x1={18}
                        y1={yStart}
                        x2={18}
                        y2={yEnd}
                        stroke={col}
                        strokeWidth={14}
                        opacity={0.12}
                        strokeLinecap="round"
                        filter="url(#glow-span)"
                      />
                    )}

                    {/* Main span line */}
                    <line
                      x1={18}
                      y1={yStart}
                      x2={18}
                      y2={yEnd}
                      stroke={`url(#span-grad-${span.id})`}
                      strokeWidth={isVis ? 5 : 3}
                      strokeLinecap="round"
                      style={{
                        transition: 'stroke-width 0.2s ease',
                        cursor: 'pointer',
                        pointerEvents: 'all'
                      }}
                    />

                    {/* Drag handles at endpoints — only when active */}
                    {isVis && (
                      <>
                        <circle
                          cx={18} cy={yStart} r={4}
                          fill="white" stroke={col} strokeWidth={1.5}
                          style={{ cursor: 'ns-resize', pointerEvents: 'all' }}
                          onMouseDown={(e) => { e.stopPropagation(); stableHandlers.openSpan(span.id); stableHandlers.beginResize(span.id, 'start'); }}
                        />
                        <circle
                          cx={18} cy={yEnd} r={4}
                          fill="white" stroke={col} strokeWidth={1.5}
                          style={{ cursor: 'ns-resize', pointerEvents: 'all' }}
                          onMouseDown={(e) => { e.stopPropagation(); stableHandlers.openSpan(span.id); stableHandlers.beginResize(span.id, 'end'); }}
                        />
                      </>
                    )}

                    {/* Climax mark disabled */}

                    {/* Center dot — always visible, opens edit on click */}
                    <g
                      onMouseDown={(e) => e.stopPropagation()}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (editingSpan && editingSpan !== span.id) {
                          void saveCurrentSpanTextIfDirty();
                        }
                        setActiveSpan(span.id);
                        setEditingSpan(span.id);
                        setEditTitle(span.title);
                        setEditBody(span.body);
                      }}
                      onMouseEnter={() => setHoveredSpan(span.id)}
                      onMouseLeave={() => setHoveredSpan(null)}
                      style={{ cursor: 'pointer', pointerEvents: 'all' }}
                    >
                      <circle
                        cx={18} cy={yMid}
                        r={isVis ? 8 : 5}
                        fill={col}
                        opacity={isVis ? 1 : 0.55}
                      />
                      <circle
                        cx={18} cy={yMid}
                        r={isVis ? 2.5 : 1.5}
                        fill="white"
                        opacity={0.9}
                        style={{ pointerEvents: 'none' }}
                      />
                    </g>
                  </g>
                );
              })}

            {/* In-progress drag creation */}
            {drag?.type === 'create' &&
              drag.a !== undefined &&
              drag.b !== undefined &&
              slotAnchors.length > 0 &&
              (() => {
                const yA = fracToY(Math.min(drag.a, drag.b), slotAnchors);
                const yB = fracToY(Math.max(drag.a, drag.b), slotAnchors);
                return (
                  <line
                    x1={18}
                    y1={yA}
                    x2={18}
                    y2={yB}
                    stroke="url(#span-drag-grad)"
                    strokeWidth={4}
                    strokeLinecap="round"
                  />
                );
              })()}

            {/* Z-linjen (eelPath) gömd enligt användarens önskemål */}
            {false && eelSegments.length > 0 ? (
              eelSegments.map((segmentPath, i) => (
                <path
                  key={`eel-segment-${i}`}
                  d={segmentPath}
                  stroke={eelGradients[i] ? `url(#${eelGradients[i].id})` : '#D1C4B5'}
                  strokeWidth={2.5}
                  fill="none"
                  opacity={0}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              ))
            ) : (
              false && <path
                d={eelPath}
                stroke="#D1C4B5"
                strokeWidth={2.5}
                fill="none"
                opacity={0}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            )}
          </svg>
        )}

        {/* Grid — clicking it clears active span so eel returns to idle */}
        <div
          ref={gridRef}
          onClick={() => {
            if (activeSpan && !editingSpan) setActiveSpan(null);
          }}
          style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${gridConfig.columns}, 1fr)`,
            gap: 8,
            position: 'relative',
            zIndex: 2
          }}
        >
          {slotMap.map((slot, slotIdx) => {
            const spanData = allSpansCoverage.get(slotIdx);
            return (
              <FeedSlot
                key={slot.slotIndex}
                slot={slot}
                tags={cmTags}
              config={gridConfig}
              spanCoverage={spanData?.coverage ?? 0}
              spanColor={spanData?.color ?? null}
              showSpanCoverageLabels={eelHovered || !!activeSpan || !!editingSpan || !!drag}
              projectedDate={tempoDateMap.get(slot.feedOrder) ?? null}
              isFreshEvidence={slot.concept != null && focusedEvidenceIds.has(slot.concept.id)}
              historyReconciliationTargets={historyReconciliationTargets}
              currentHistoryDefaultTarget={currentHistoryDefaultTarget}
              getConceptDetails={getConceptDetails}
              onCheckAndMarkProduced={handleCheckAndMarkProduced}
              onMarkProduced={handleMarkProduced}
              onOpenMarkProducedDialog={handleOpenMarkProducedDialog}
              onReconcileHistory={handleReconcileHistory}
              onUndoHistoryReconciliation={handleUndoHistoryReconciliation}
              onRemoveFromSlot={handleRemoveFromSlot}
              onAssignToSlot={handleAssignToSlot}
              onSwapFeedOrder={handleSwapFeedOrder}
              allConcepts={concepts}
              onUpdateTags={handleUpdateConceptTags}
              onUpdateNote={handleUpdateCmNote}
              onUpdateTikTokUrl={handleUpdateTikTokUrl}
              onPatchConcept={handlePatchConcept}
              onOpenConcept={onOpenConcept}
              onSlotClick={onSlotClick}
            />
            );
          })}
        </div>

        {/* Empty feed state (Task 8): shown when no LeTrend concepts have been assigned */}
        {hasNoConcepts && (
          <div style={{
            marginTop: 16,
            padding: '28px 24px',
            background: '#faf8f5',
            border: `1px dashed ${LeTrendColors.border}`,
            borderRadius: LeTrendRadius.lg,
            textAlign: 'center',
          }}>
            <div style={{ fontSize: 22, marginBottom: 10, opacity: 0.35 }}>📋</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: LeTrendColors.brownDark, marginBottom: 6 }}>
              Inga koncept planerade ännu
            </div>
            <div style={{ fontSize: 12, color: LeTrendColors.textMuted, maxWidth: 280, margin: '0 auto' }}>
              Lägg till koncept i Koncept-fliken först och placera dem sedan här i planen.
            </div>
            <button
              type="button"
              onClick={() => onOpenKonceptSection?.()}
              style={{
                marginTop: 12,
                padding: '8px 12px',
                background: '#fff',
                border: `1px solid ${LeTrendColors.border}`,
                borderRadius: LeTrendRadius.md,
                color: LeTrendColors.brownDark,
                fontSize: 12,
                fontWeight: 700,
                cursor: onOpenKonceptSection ? 'pointer' : 'default',
              }}
            >
              Öppna Koncept-fliken →
            </button>
          </div>
        )}

        {/* Floating edit panel — positioned over grid, centered at span midpoint */}
        {editingSpan && editPanelY !== null && (() => {
          const span = spans.find(s => s.id === editingSpan);
          if (!span) return null;
          const col = SPAN_COLOR_PALETTE[span.color_index].color;
          const count = slotAnchors.length ? touchedSlots(span, slotAnchors).length : 0;
          const countToDisplay = editingSpan === span.id ? animatedCount : count;
          const isDirty = editTitle !== span.title || editBody !== span.body;

          return (
            <div
              style={{
                position: 'absolute',
                left: 78,
                right: 0,
                top: editPanelY,
                transform: 'translateY(-50%)',
                zIndex: 10,
                pointerEvents: 'none',
              }}
            >
              <div
                style={{
                  width: 'min(300px, 100%)',
                  background: '#fff',
                  borderRadius: LeTrendRadius.lg,
                  padding: '14px 16px',
                  boxShadow: '0 6px 28px rgba(74,47,24,0.16)',
                  borderTop: `3px solid ${col}`,
                  pointerEvents: 'all',
                }}
              >
                {/* Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: col }} />
                    <span style={{ fontSize: 10, fontWeight: 700, color: col, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                      {SPAN_COLOR_PALETTE[span.color_index].name}
                    </span>
                    <span style={{ fontSize: 10, color: LeTrendColors.textMuted }}>· {countToDisplay} klipp</span>
                    {isDirty && (
                      <span style={{ fontSize: 9, color: '#d97706', fontWeight: 600, background: '#fef3c7', borderRadius: 4, padding: '1px 5px' }}>
                        Osparad
                      </span>
                    )}
                  </div>
                  <button
                    onClick={() => {
                      // Close without saving — restore to last saved values
                      setEditTitle(span.title);
                      setEditBody(span.body);
                      setEditingSpan(null);
                      setActiveSpan(null);
                    }}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: LeTrendColors.textMuted, fontSize: 18, lineHeight: 1 }}
                  >×</button>
                </div>

                <input
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  placeholder="Rubrik — t.ex. Alla hjärtans dag"
                  style={{
                    width: '100%', padding: '7px 9px', borderRadius: LeTrendRadius.md,
                    border: `1.5px solid ${col}44`, fontSize: 12, fontWeight: 600,
                    color: LeTrendColors.brownDark, background: LeTrendColors.cream,
                    outline: 'none', marginBottom: 7, boxSizing: 'border-box', fontFamily: 'inherit'
                  }}
                />

                <textarea
                  value={editBody}
                  onChange={(e) => setEditBody(e.target.value)}
                  placeholder="Strategi och innehållstankar för detta spann..."
                  rows={3}
                  style={{
                    width: '100%', padding: '7px 9px', borderRadius: LeTrendRadius.md,
                    border: `1.5px solid ${LeTrendColors.border}`, fontSize: 11, lineHeight: 1.5,
                    color: LeTrendColors.brownDark, background: '#fff', outline: 'none',
                    resize: 'vertical', boxSizing: 'border-box', fontFamily: 'inherit'
                  }}
                />

                {/* Färgval */}
                <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 5 }}>
                  <span style={{ fontSize: 10, color: LeTrendColors.textMuted, fontWeight: 600, flexShrink: 0 }}>Färg:</span>
                  {SPAN_COLOR_PALETTE.map((p, i) => (
                    <div
                      key={i}
                      title={p.name}
                      onClick={() => {
                        setSpans(prev => prev.map(s => s.id === span.id ? { ...s, color_index: i } : s));
                        setNextColorIdx(i);
                        void fetch(`/api/studio-v2/feed-spans/${span.id}`, {
                          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ color_index: i })
                        }).catch(() => void reloadSpansFromServer());
                      }}
                      style={{
                        width: i === span.color_index ? 14 : 10,
                        height: i === span.color_index ? 14 : 10,
                        borderRadius: '50%',
                        background: p.color,
                        cursor: 'pointer',
                        outline: i === span.color_index ? `2px solid ${p.color}` : 'none',
                        outlineOffset: 2,
                        opacity: i === span.color_index ? 1 : 0.4,
                        transition: 'all 0.12s',
                        flexShrink: 0,
                      }}
                    />
                  ))}
                </div>

                {/* Spandatum — visar range, klicka "ändra" för att editera */}
                {(() => {
                  const startDate = globalFracToProjectedDate(span.frac_start, tempoAnchor, tempoWeekdays, gridConfig);
                  const endDate   = globalFracToProjectedDate(span.frac_end,   tempoAnchor, tempoWeekdays, gridConfig);
                  if (!startDate && !endDate) return null;
                  const fmt = (d: Date | null) => d ? d.toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' }) : '?';
                  const toVal = (d: Date | null) => d ? d.toISOString().slice(0, 10) : '';
                  const fromInput = (val: string, fallback: number) => {
                    if (!val) return fallback;
                    const f = dateToGlobalFrac(new Date(val), tempoAnchor, tempoWeekdays, gridConfig);
                    return f ?? fallback;
                  };
                  return (
                    <div style={{ marginTop: 8 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 10, color: LeTrendColors.textMuted, fontWeight: 600, flexShrink: 0 }}>Period:</span>
                        {!editingPeriod ? (
                          <>
                            <span style={{ fontSize: 11, color: col, fontWeight: 500 }}>{fmt(startDate)} – {fmt(endDate)}</span>
                            <button type="button" onClick={() => setEditingPeriod(true)}
                              style={{ fontSize: 9, color: LeTrendColors.textMuted, background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', padding: 0, flexShrink: 0 }}>
                              ändra
                            </button>
                          </>
                        ) : (
                          <>
                            <input type="date" defaultValue={toVal(startDate)} key={`start-${span.id}`}
                              onBlur={(e) => {
                                const newFrac = fromInput(e.target.value, span.frac_start);
                                if (Math.abs(newFrac - span.frac_start) < 0.001) return;
                                setSpans(prev => prev.map(s => s.id === span.id ? { ...s, frac_start: Math.min(newFrac, s.frac_end - 0.01) } : s));
                                void fetch(`/api/studio-v2/feed-spans/${span.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ frac_start: Math.min(newFrac, span.frac_end - 0.01) }) }).catch(() => void reloadSpansFromServer());
                              }}
                              style={{ fontSize: 10, padding: '3px 6px', borderRadius: LeTrendRadius.sm, border: `1px solid ${col}44`, color: col, background: `${col}0d`, outline: 'none', cursor: 'pointer' }}
                            />
                            <span style={{ fontSize: 9, color: LeTrendColors.textMuted }}>–</span>
                            <input type="date" defaultValue={toVal(endDate)} key={`end-${span.id}`}
                              onBlur={(e) => {
                                const newFrac = fromInput(e.target.value, span.frac_end);
                                if (Math.abs(newFrac - span.frac_end) < 0.001) return;
                                setSpans(prev => prev.map(s => s.id === span.id ? { ...s, frac_end: Math.max(newFrac, s.frac_start + 0.01) } : s));
                                void fetch(`/api/studio-v2/feed-spans/${span.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ frac_end: Math.max(newFrac, span.frac_start + 0.01) }) }).catch(() => void reloadSpansFromServer());
                              }}
                              style={{ fontSize: 10, padding: '3px 6px', borderRadius: LeTrendRadius.sm, border: `1px solid ${col}44`, color: col, background: `${col}0d`, outline: 'none', cursor: 'pointer' }}
                            />
                          </>
                        )}
                      </div>
                    </div>
                  );
                })()}

                {/* Klimaxdatum — inaktiverat */}

                {/* Footer actions */}
                <div style={{ display: 'flex', gap: 8, marginTop: 10, justifyContent: 'space-between' }}>
                  <button
                    onClick={async () => {
                      if (!confirm('Ta bort detta spann?')) return;
                      try {
                        await fetch(`/api/studio-v2/feed-spans/${span.id}`, { method: 'DELETE' });
                        setSpans(prev => prev.filter(s => s.id !== span.id));
                        setEditingSpan(null); setActiveSpan(null);
                      } catch { alert('Kunde inte ta bort spann'); }
                    }}
                    style={{ fontSize: 10, padding: '5px 10px', borderRadius: LeTrendRadius.sm, background: 'transparent', border: `1px solid ${LeTrendColors.border}`, color: LeTrendColors.textMuted, cursor: 'pointer' }}
                  >
                    Ta bort spann
                  </button>
                  <button
                    onClick={async () => {
                      setSpans(prev => prev.map(s => s.id === span.id ? { ...s, title: editTitle, body: editBody } : s));
                      try {
                        await fetch(`/api/studio-v2/feed-spans/${span.id}`, {
                          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ title: editTitle, body: editBody })
                        });
                        setEditingSpan(null); setActiveSpan(null);
                      } catch {
                        alert('Kunde inte spara spann');
                        void reloadSpansFromServer();
                      }
                    }}
                    style={{ fontSize: 10, padding: '5px 14px', borderRadius: LeTrendRadius.sm, background: LeTrendColors.brownDark, color: LeTrendColors.cream, border: 'none', cursor: 'pointer', fontWeight: 700 }}
                  >
                    Godkänn
                  </button>
                </div>
              </div>
            </div>
          );
        })()}
      </div>

      {/* Scroll controls + undo */}
      <div style={{
        marginTop: 16,
        display: 'flex',
        gap: 8,
        alignItems: 'center',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
        position: 'sticky',
        bottom: 12,
        zIndex: 6,
        padding: '10px 12px',
        borderRadius: LeTrendRadius.lg,
        background: 'rgba(250,248,245,0.94)',
        border: `1px solid ${LeTrendColors.border}`,
        backdropFilter: 'blur(8px)',
      }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <button
            onClick={() => setHistoryOffset(prev => Math.max(prev - gridConfig.columns, -maxForwardSlots))}
            disabled={historyOffset <= -maxForwardSlots}
            title="Flytta vyn en rad upp"
            aria-label={`Flytta vyn en rad upp. Nuvarande uppforflyttning ar ${upwardOffset} slotar.`}
            style={{
              padding: '8px 14px',
              background: 'white',
              border: `1px solid ${LeTrendColors.border}`,
              borderRadius: LeTrendRadius.md,
              cursor: historyOffset <= -maxForwardSlots ? 'default' : 'pointer',
              fontSize: 12,
              fontWeight: 600,
              color: LeTrendColors.brownDark,
              opacity: historyOffset <= -maxForwardSlots ? 0.4 : 1
            }}
          >
            ↑ {upwardOffset}
          </button>

          <button
            onClick={() => {
              if (fetchingProfileHistory) return;
              setHistoryOffset(prev => Math.min(prev + gridConfig.columns, maxExtraHistorySlots));
            }}
            disabled={historyOffset >= maxExtraHistorySlots || fetchingProfileHistory}
            title={fetchingProfileHistory ? 'Laddar historik' : 'Flytta vyn en rad ned'}
            aria-label={
              fetchingProfileHistory
                ? 'Laddar historik'
                : `Flytta vyn en rad ned. Nuvarande nedforflyttning ar ${downwardOffset} slotar.`
            }
            style={{
              padding: '8px 14px',
              background: 'white',
              border: `1px solid ${LeTrendColors.border}`,
              borderRadius: LeTrendRadius.md,
              cursor: (historyOffset >= maxExtraHistorySlots || fetchingProfileHistory) ? 'default' : 'pointer',
              fontSize: 12,
              fontWeight: 600,
              color: LeTrendColors.brownDark,
              opacity: (historyOffset >= maxExtraHistorySlots || fetchingProfileHistory) ? 0.4 : 1
            }}
          >
            {fetchingProfileHistory ? '…' : `↓ ${downwardOffset === 0 ? 0 : `-${downwardOffset}`}`}
          </button>

          {historyOffset !== 0 && (
            <button
              onClick={() => setHistoryOffset(0)}
              style={{
                padding: '8px 14px',
                background: LeTrendColors.brownDark,
                border: 'none',
                borderRadius: LeTrendRadius.md,
                cursor: 'pointer',
                fontSize: 12,
                fontWeight: 700,
                color: 'white'
              }}
            >
              ↻ Nu
            </button>
          )}
        </div>

        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {!historyHasMore && historyOffset > 0 && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 11, color: LeTrendColors.textMuted, fontStyle: 'italic' }}>
                Äldsta klipp visas
              </span>
              <button
                onClick={() => void reloadSpansFromServer()}
                style={{
                  padding: '4px 10px',
                  background: 'transparent',
                  border: `1px solid ${LeTrendColors.border}`,
                  borderRadius: LeTrendRadius.md,
                  cursor: 'pointer',
                  fontSize: 11,
                  fontWeight: 500,
                  color: LeTrendColors.textMuted,
                }}
              >
                Ladda äldre historik
              </button>
            </span>
          )}

          {historyOffset !== 0 && (
            <span style={{ fontSize: 11, color: LeTrendColors.textMuted }}>
              Vyn ar forskjuten {historyOffset < 0 ? `${upwardOffset} upp` : `${downwardOffset} ned`}
            </span>
          )}
        </div>

      </div>

      {/* Passive span body preview — visible on center-dot hover, hides when editing */}
      {hoveredSpan && !editingSpan && (() => {
        const hSpan = spans.find(s => s.id === hoveredSpan);
        if (!hSpan?.body?.trim()) return null;
        const col = SPAN_COLOR_PALETTE[hSpan.color_index].color;
        return (
          <div style={{
            marginTop: 12,
            padding: '10px 14px',
            borderRadius: LeTrendRadius.md,
            borderLeft: `3px solid ${col}`,
            background: `${col}0a`,
            fontSize: 11.5,
            color: LeTrendColors.textSecondary,
            lineHeight: 1.6
          }}>
            {hSpan.title && (
              <div style={{ fontWeight: 700, color: col, fontSize: 11, marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                {hSpan.title}
              </div>
            )}
            {hSpan.body}
          </div>
        );
      })()}

      {/* Tag Manager Modal */}
      {showTagManager && (
        <TagManager
          tags={cmTags}
          onClose={() => setShowTagManager(false)}
          onTagsUpdated={async () => {
            await refreshCmTags(true);
          }}
        />
      )}
    </div>
  </>
  );
}
