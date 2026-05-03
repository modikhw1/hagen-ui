'use client';

import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import { SPAN_COLOR_PALETTE, type FeedSpan } from '@/types/studio-v2';
import type { GridConfig } from '@/types/studio-v2';
import { fracToFeedOrder } from '@/lib/feed-planner-utils';

type DragState =
  | {
      type: 'create' | 'start' | 'end' | 'climax';
      spanId?: string;
      a?: number;
      b?: number;
      colorIdx?: number;
    }
  | null;

export interface SpanHandlerRefs {
  spans: FeedSpan[];
  slotAnchors: Array<{ yTop: number; yMid: number; yBot: number }>;
  drag: DragState;
  activeSpan: string | null;
  nextColorIdx: number;
  fracOffset: number;
  historyOffset: number;
  gridConfig: GridConfig;
  reloadSpans: () => Promise<void>;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export function yToFrac(
  y: number,
  anchors: Array<{ yTop: number; yMid: number; yBot: number }>
): number {
  if (anchors.length === 0) return 0;
  const total = anchors[anchors.length - 1].yBot - anchors[0].yTop;
  if (total <= 0) return 0;
  return clamp01((y - anchors[0].yTop) / total);
}

export function fracToY(
  frac: number,
  anchors: Array<{ yTop: number; yMid: number; yBot: number }>
): number {
  if (anchors.length === 0) return 0;
  const total = anchors[anchors.length - 1].yBot - anchors[0].yTop;
  return anchors[0].yTop + total * clamp01(frac);
}

export function createSpanHandlers(
  getGridElement: () => HTMLDivElement | null,
  refs: MutableRefObject<SpanHandlerRefs>,
  setDrag: Dispatch<SetStateAction<DragState>>,
  setSpans: Dispatch<SetStateAction<FeedSpan[]>>,
  setActiveSpan: Dispatch<SetStateAction<string | null>>,
  setHoveredSpan: Dispatch<SetStateAction<string | null>>,
  setEditingSpan: Dispatch<SetStateAction<string | null>>,
  setEditTitle: Dispatch<SetStateAction<string>>,
  setEditBody: Dispatch<SetStateAction<string>>,
  setNextColorIdx: Dispatch<SetStateAction<number>>,
  customerId: string
) {
  const pointerFrac = (clientY: number) => {
    const grid = getGridElement();
    if (!grid) return 0;
    const rect = grid.getBoundingClientRect();
    return yToFrac(clientY - rect.top, refs.current.slotAnchors);
  };

  return {
    onEelDown(event: React.MouseEvent<SVGSVGElement>) {
      event.preventDefault();
      setDrag({
        type: 'create',
        a: pointerFrac(event.clientY),
        b: pointerFrac(event.clientY),
        colorIdx: refs.current.nextColorIdx,
      });
    },

    onMove(event: MouseEvent) {
      const drag = refs.current.drag;
      if (!drag) return;
      const nextFrac = pointerFrac(event.clientY);

      if (drag.type === 'create') {
        // Live clamp: don't let the in-progress span overlap an existing span
        const globalA = (drag.a ?? 0) + refs.current.fracOffset;
        const globalB = nextFrac + refs.current.fracOffset;
        const goingDown = globalB > globalA;
        const allSpans = refs.current.spans;
        let clampedB = nextFrac;
        if (goingDown) {
          // dragging end downward — clamp against the nearest span that starts strictly below globalA
          const upperBound = allSpans
            .filter(s => s.frac_start > globalA)
            .reduce((min, s) => Math.min(min, s.frac_start), 1);
          clampedB = Math.min(nextFrac, upperBound - refs.current.fracOffset);
        } else {
          // dragging end upward — clamp against the nearest span that ends strictly above globalA
          const lowerBound = allSpans
            .filter(s => s.frac_end < globalA)
            .reduce((max, s) => Math.max(max, s.frac_end), 0);
          clampedB = Math.max(nextFrac, lowerBound - refs.current.fracOffset);
        }
        setDrag((prev) => (prev ? { ...prev, b: clampedB } : prev));
        return;
      }

      if (!drag.spanId) return;
      const adjustedFrac = nextFrac + refs.current.fracOffset;
      const otherSpans = refs.current.spans.filter(s => s.id !== drag.spanId);
      setSpans((prev) =>
        prev.map((span) => {
          if (span.id !== drag.spanId) return span;
          if (drag.type === 'start') {
            // Hard stop: clamp against spans that end at or before the current start
            const lowerBound = otherSpans
              .filter(s => s.frac_end <= span.frac_start + 0.001)
              .reduce((max, s) => Math.max(max, s.frac_end), Number.NEGATIVE_INFINITY);
            const clamped = Math.max(adjustedFrac, lowerBound);
            const nextStart = Math.min(clamped, span.frac_end - 0.01);
            return {
              ...span,
              frac_start: nextStart,
              start_feed_order: fracToFeedOrder(nextStart, 0, refs.current.gridConfig),
            };
          }
          if (drag.type === 'end') {
            // Hard stop: clamp against spans that start at or after the current end
            const upperBound = otherSpans
              .filter(s => s.frac_start >= span.frac_end - 0.001)
              .reduce((min, s) => Math.min(min, s.frac_start), Number.POSITIVE_INFINITY);
            const clamped = Math.min(adjustedFrac, upperBound);
            const nextEnd = Math.max(clamped, span.frac_start + 0.01);
            return {
              ...span,
              frac_end: nextEnd,
              end_feed_order: fracToFeedOrder(nextEnd, 0, refs.current.gridConfig),
            };
          }
          return span;
        })
      );
    },

    onUp() {
      const drag = refs.current.drag;
      // Clear drag immediately so UI is responsive regardless of server round-trip
      setDrag(null);
      setHoveredSpan(null);
      if (!drag) return;

      if (drag.type === 'create' && drag.a !== undefined && drag.b !== undefined) {
        const start = Math.min(drag.a, drag.b) + refs.current.fracOffset;
        const end = Math.max(drag.a, drag.b) + refs.current.fracOffset;
        if (end - start > 0.01) {
          // Abort if the new span would overlap any existing span
          const hasOverlap = refs.current.spans.some(
            s => !(end <= s.frac_start || start >= s.frac_end)
          );
          if (hasOverlap) return;
          const spanId = crypto.randomUUID();
          const colorIdx = drag.colorIdx ?? 0;
          const now = new Date().toISOString();

          const newSpan: FeedSpan = {
            id: spanId,
            customer_id: customerId,
            cm_id: '',
            frac_start: start,
            frac_end: end,
            start_feed_order: fracToFeedOrder(start, 0, refs.current.gridConfig),
            end_feed_order: fracToFeedOrder(end, 0, refs.current.gridConfig),
            climax: null,
            climax_date: null,
            color_index: colorIdx % SPAN_COLOR_PALETTE.length,
            title: '',
            body: '',
            created_at: now,
            updated_at: now,
          };

          // Optimistic local add
          setSpans((prev) => [...prev, newSpan]);
          setActiveSpan(newSpan.id);
          setEditingSpan(newSpan.id);
          setEditTitle('');
          setEditBody('');
          setNextColorIdx((prev) => (prev + 1) % SPAN_COLOR_PALETTE.length);

          // Persist to server — fire-and-forget, optimistic span is kept on failure
          fetch('/api/studio-v2/feed-spans', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              ...newSpan,
              history_offset: refs.current.historyOffset,
            }),
          }).then(async (res) => {
            if (!res.ok) {
              const data = await res.json().catch(() => ({}));
              console.error('[SpanHandlers] create persist failed:', data.error || `HTTP ${res.status}`);
            }
          }).catch((err) => {
            console.error('[SpanHandlers] create persist network error:', err);
          });
        }
        return;
      }

      if (drag.spanId && (drag.type === 'start' || drag.type === 'end' || drag.type === 'climax')) {
        // Resize ended — PATCH updated geometry to server
        const span = refs.current.spans.find((s) => s.id === drag.spanId);
        if (span) {
          fetch(`/api/studio-v2/feed-spans/${span.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              frac_start: span.frac_start,
              frac_end: span.frac_end,
              start_feed_order: fracToFeedOrder(span.frac_start, 0, refs.current.gridConfig),
              end_feed_order: fracToFeedOrder(span.frac_end, 0, refs.current.gridConfig),
              climax: span.climax,
            }),
          }).then(async (res) => {
            if (!res.ok) {
              const data = await res.json().catch(() => ({}));
              console.error('[SpanHandlers] resize persist failed:', data.error || `HTTP ${res.status}`);
            }
          }).catch((err) => {
            console.error('[SpanHandlers] resize persist network error:', err);
          });
        }
      }
    },

    beginResize(spanId: string, type: 'start' | 'end' | 'climax') {
      setDrag({ type, spanId });
    },

    openSpan(spanId: string) {
      const span = refs.current.spans.find((item) => item.id === spanId);
      setActiveSpan(spanId);
      setEditingSpan(spanId);
      setEditTitle(span?.title || '');
      setEditBody(span?.body || '');
    },

    hoverSpan(spanId: string | null) {
      setHoveredSpan(spanId);
    },
  };
}
