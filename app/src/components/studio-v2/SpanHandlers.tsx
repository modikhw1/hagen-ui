'use client';

import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import { SPAN_COLOR_PALETTE, type FeedSpan } from '@/types/studio-v2';

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
        setDrag((prev) => (prev ? { ...prev, b: nextFrac } : prev));
        return;
      }

      if (!drag.spanId) return;
      const adjustedFrac = clamp01(nextFrac + refs.current.fracOffset);
      setSpans((prev) =>
        prev.map((span) => {
          if (span.id !== drag.spanId) return span;
          if (drag.type === 'start') {
            return { ...span, frac_start: Math.min(adjustedFrac, span.frac_end - 0.01) };
          }
          if (drag.type === 'end') {
            return { ...span, frac_end: Math.max(adjustedFrac, span.frac_start + 0.01) };
          }
          if (drag.type === 'climax') {
            return { ...span, climax: adjustedFrac };
          }
          return span;
        })
      );
    },

    async onUp() {
      const drag = refs.current.drag;
      if (!drag) return;

      if (drag.type === 'create' && drag.a !== undefined && drag.b !== undefined) {
        const start = Math.min(drag.a, drag.b) + refs.current.fracOffset;
        const end = Math.max(drag.a, drag.b) + refs.current.fracOffset;
        if (end - start > 0.01) {
          const spanId = crypto.randomUUID();
          const colorIdx = drag.colorIdx ?? 0;
          const now = new Date().toISOString();

          const newSpan: FeedSpan = {
            id: spanId,
            customer_id: customerId,
            cm_id: '',
            frac_start: clamp01(start),
            frac_end: clamp01(end),
            climax: null,
            climax_date: null,
            color_index: colorIdx % SPAN_COLOR_PALETTE.length,
            title: '',
            body: '',
            created_at: now,
            updated_at: now,
          };

          setSpans((prev) => [...prev, newSpan]);
          setActiveSpan(newSpan.id);
          setEditingSpan(newSpan.id);
          setEditTitle('');
          setEditBody('');
          setNextColorIdx((prev) => (prev + 1) % SPAN_COLOR_PALETTE.length);
        }
      }

      setDrag(null);
      setHoveredSpan(null);
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
