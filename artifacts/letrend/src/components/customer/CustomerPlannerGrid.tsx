'use client';

// PARITY NOTE: CM-facing planner is FeedPlanner.tsx (studio/FeedPlanner).
// When changing slot semantics, navigation, or history rendering here,
// check whether the CM planner needs a matching update.
// Key shared invariants: currentSlotIndex=4 (center of 3×3),
// feed_order < 0 = history, = 0 = current, > 0 = planned.

import { useEffect, useRef, useState } from 'react';
import type { CustomerFeedSlot } from '@/types/customer-feed';
import { colors, fontFamily } from '@/styles/mobile-design';

// 3×3 grid, currentSlotIndex=4 → feedOrder 0 sits at center cell (slotIndex 4)
// Orientation: future top, now center, history bottom
// At windowOffset=0:
//   Row 0 (slots 0–2): feedOrders +4, +3, +2  — upcoming
//   Row 1 (slots 3–5): feedOrders +1,  0, -1  — next | NOW | most recent history
//   Row 2 (slots 6–8): feedOrders -2, -3, -4  — older history
// windowOffset shifts the entire window: positive → toward future, negative → toward history
const CURRENT_SLOT_INDEX = 4;
const TOTAL_SLOTS = 9;
const WINDOW_STEP = 3;           // one row per navigation press
const MAX_WINDOW_OFFSET = 12;    // up to 4 rows into future
const MIN_WINDOW_OFFSET = -12;   // up to 4 rows into history

type GridCell = {
  slotIndex: number;
  feedOrder: number;
  slot: CustomerFeedSlot | null;
};

function buildCustomerSlotMap(slots: CustomerFeedSlot[], windowOffset: number): GridCell[] {
  return Array.from({ length: TOTAL_SLOTS }, (_, slotIndex) => {
    const feedOrder = CURRENT_SLOT_INDEX - slotIndex + windowOffset;
    return {
      slotIndex,
      feedOrder,
      slot: slots.find(s => s.placement.feedOrder === feedOrder) ?? null,
    };
  });
}

function formatCompactViews(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace('.0', '')}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace('.0', '')}k`;
  return String(n);
}

export function CustomerPlannerGrid({
  slots,
  variant,
}: {
  slots: CustomerFeedSlot[];
  variant: 'mobile' | 'desktop';
}) {
  const isMobile = variant === 'mobile';
  const [windowOffset, setWindowOffset] = useState(0);
  const cellMap = buildCustomerSlotMap(slots, windowOffset);
  const gridRef = useRef<HTMLDivElement>(null);
  const wheelCbRef = useRef<(e: WheelEvent) => void>(() => {});
  useEffect(() => {
    const cooldown = { active: false };
    wheelCbRef.current = (e: WheelEvent) => {
      e.preventDefault();
      if (cooldown.active) return;
      cooldown.active = true;
      setTimeout(() => { cooldown.active = false; }, 280);
      if (e.deltaY > 0) {
        setWindowOffset(o => Math.max(o - WINDOW_STEP, MIN_WINDOW_OFFSET));
      } else if (e.deltaY < 0) {
        setWindowOffset(o => Math.min(o + WINDOW_STEP, MAX_WINDOW_OFFSET));
      }
    };
  }, []);
  useEffect(() => {
    const el = gridRef.current;
    if (!el) return;
    const cb = (e: WheelEvent) => wheelCbRef.current(e);
    el.addEventListener('wheel', cb, { passive: false });
    return () => el.removeEventListener('wheel', cb);
  }, []);
  // True when any upcoming concept exists — used to give the empty center cell
  // a smarter hint instead of the generic "being prepared" message.
  const hasNearbyUpcoming = slots.some(s => s.placement.feedOrder > 0);

  const canGoForward = windowOffset < MAX_WINDOW_OFFSET;
  const canGoBack = windowOffset > MIN_WINDOW_OFFSET;
  const isOffCenter = windowOffset !== 0;

  const navButtonBase: React.CSSProperties = {
    background: 'none',
    border: `1px solid ${isMobile ? colors.muted : '#e5e7eb'}`,
    borderRadius: 999,
    padding: '4px 10px',
    fontSize: 11,
    fontWeight: 600,
    cursor: 'pointer',
    color: isMobile ? colors.textMuted : '#6b7280',
    fontFamily: isMobile ? fontFamily : undefined,
    transition: 'opacity 0.15s',
  };

  return (
    <div style={{
      maxWidth: isMobile ? undefined : 300,
      marginBottom: isMobile ? 24 : 28,
    }}>
      <div
        ref={gridRef}
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: isMobile ? 5 : 6,
        }}
      >
        {cellMap.map(cell => (
          <PlannerCell key={cell.slotIndex} cell={cell} isMobile={isMobile} hasNearbyUpcoming={hasNearbyUpcoming} />
        ))}
      </div>

      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginTop: 8,
        gap: 6,
      }}>
        <button
          onClick={() => setWindowOffset(o => Math.min(o + WINDOW_STEP, MAX_WINDOW_OFFSET))}
          disabled={!canGoForward}
          style={{ ...navButtonBase, opacity: canGoForward ? 1 : 0.3 }}
        >
          ⬆ Framåt
        </button>

        {isOffCenter && (
          <button
            onClick={() => setWindowOffset(0)}
            style={{ ...navButtonBase, fontSize: 10, color: isMobile ? colors.textSubtle : '#9ca3af', borderStyle: 'dashed' }}
          >
            ↻ Nu
          </button>
        )}

        <button
          onClick={() => setWindowOffset(o => Math.max(o - WINDOW_STEP, MIN_WINDOW_OFFSET))}
          disabled={!canGoBack}
          style={{ ...navButtonBase, opacity: canGoBack ? 1 : 0.3 }}
        >
          Historik ⬇
        </button>
      </div>
    </div>
  );
}

function PlannerCell({ cell, isMobile, hasNearbyUpcoming }: { cell: GridCell; isMobile: boolean; hasNearbyUpcoming: boolean }) {
  const { feedOrder, slot } = cell;
  const isNow = feedOrder === 0;
  const isPast = feedOrder < 0;
  const depth = isPast ? Math.abs(feedOrder) : 0;
  const thumbnailUrl = slot?.result.tiktokThumbnailUrl ?? null;
  const hasThumbnail = Boolean(thumbnailUrl);

  let bg: string;
  let border: string;
  let backgroundImage: string | undefined;

  if (hasThumbnail && thumbnailUrl) {
    // Thumbnail cells: dark gradient overlay so text stays readable
    bg = '#1a1a1a';
    border = isNow
      ? `2px solid ${isMobile ? '#c084fc' : '#8b5cf6'}`
      : `1px solid rgba(255,255,255,0.08)`;
    backgroundImage = `linear-gradient(to bottom, rgba(0,0,0,0.22) 0%, rgba(0,0,0,0.62) 100%), url(${thumbnailUrl})`;
  } else if (isNow && slot) {
    bg = isMobile ? '#fdf4ff' : '#faf5ff';
    border = `2px solid ${isMobile ? '#c084fc' : '#8b5cf6'}`;
  } else if (isNow) {
    bg = '#f5f3ff';
    border = '2px dashed #c4b5fd';
  } else if (isPast) {
    bg = isMobile ? '#f8f8f8' : '#f9fafb';
    border = `1px solid ${isMobile ? 'transparent' : '#e5e7eb'}`;
  } else {
    bg = isMobile ? colors.card : '#fff';
    border = `1px solid ${isMobile ? 'transparent' : '#e5e7eb'}`;
  }

  // Older history fades gently: depth 1→0.85, 2→0.72, 3→0.60, 4→0.50
  const opacity = isPast ? Math.max(0.5, 1 - depth * 0.13) : 1;

  return (
    <div style={{
      aspectRatio: '9/16',
      background: bg,
      backgroundImage,
      backgroundSize: hasThumbnail ? 'cover' : undefined,
      backgroundPosition: hasThumbnail ? 'center' : undefined,
      backgroundRepeat: hasThumbnail ? 'no-repeat' : undefined,
      border,
      borderRadius: isMobile ? 10 : 8,
      padding: '6px',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'space-between',
      position: 'relative',
      overflow: 'hidden',
      opacity,
      boxSizing: 'border-box',
    }}>
      {slot
        ? <FilledCellContent slot={slot} isNow={isNow} hasThumbnail={hasThumbnail} isMobile={isMobile} />
        : <EmptyCellContent feedOrder={feedOrder} isNow={isNow} isMobile={isMobile} hasNearbyUpcoming={hasNearbyUpcoming} />
      }
    </div>
  );
}

function FilledCellContent({
  slot,
  isNow,
  hasThumbnail,
  isMobile,
}: {
  slot: CustomerFeedSlot;
  isNow: boolean;
  hasThumbnail: boolean;
  isMobile: boolean;
}) {
  const isImported = slot.rowKind === 'imported_history';

  const badgeText = isNow ? 'NU' : isImported ? 'TikTok' : null;
  // On thumbnail: semi-transparent dark pill with light text
  // Without thumbnail: existing solid-color pills
  const badgeBg = hasThumbnail
    ? 'rgba(0,0,0,0.45)'
    : isNow
      ? (isMobile ? '#ede9fe' : '#ddd6fe')
      : '#f1f5f9';
  const badgeColor = hasThumbnail
    ? (isNow ? '#e9d5ff' : '#cbd5e1')
    : isNow ? '#6d28d9' : '#64748b';
  const badgeBorder = hasThumbnail
    ? `1px solid rgba(255,255,255,0.18)`
    : undefined;

  const titleColor = hasThumbnail ? '#fff' : (isMobile ? colors.text : '#1a1a2e');
  const metaColor = hasThumbnail ? 'rgba(255,255,255,0.7)' : (isMobile ? colors.textSubtle : '#9ca3af');

  return (
    <>
      {/* Top: badge or empty spacer */}
      <div style={{ minHeight: 14 }}>
        {badgeText && (
          <span style={{
            display: 'inline-block',
            padding: '1px 5px',
            borderRadius: 999,
            fontSize: 9,
            fontWeight: 700,
            letterSpacing: '0.02em',
            background: badgeBg,
            color: badgeColor,
            border: badgeBorder,
            fontFamily: isMobile ? fontFamily : undefined,
          }}>
            {badgeText}
          </span>
        )}
      </div>

      {/* Middle: title */}
      <div style={{
        fontSize: 10,
        fontWeight: 600,
        color: titleColor,
        lineHeight: 1.35,
        overflow: 'hidden',
        maxHeight: 41, // ~3 lines
        fontFamily: isMobile ? fontFamily : undefined,
        textShadow: hasThumbnail ? '0 1px 3px rgba(0,0,0,0.6)' : undefined,
      }}>
        {slot.title}
      </div>

      {/* Bottom: contextual signal */}
      <div style={{
        fontSize: 9,
        color: metaColor,
        lineHeight: 1.4,
        fontFamily: isMobile ? fontFamily : undefined,
      }}>
        {isImported && slot.result.publishedAt && (
          <div>
            {new Date(slot.result.publishedAt).toLocaleDateString('sv-SE', {
              month: 'short',
              year: 'numeric',
            })}
          </div>
        )}
        {isImported && slot.result.tiktokViews !== null && (
          <div>{formatCompactViews(slot.result.tiktokViews)} visn</div>
        )}
        {!isImported && slot.result.tiktokUrl && !hasThumbnail && (
          <div style={{ color: isMobile ? '#a78bfa' : '#7c3aed', fontWeight: 700 }}>▶</div>
        )}
      </div>
    </>
  );
}

function EmptyCellContent({
  feedOrder,
  isNow,
  isMobile,
  hasNearbyUpcoming,
}: {
  feedOrder: number;
  isNow: boolean;
  isMobile: boolean;
  hasNearbyUpcoming: boolean;
}) {
  if (isNow) {
    const hintText = hasNearbyUpcoming
      ? 'Nästa steg är klart i din plan'
      : 'Nästa steg förbereds av din CM';

    return (
      <div style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        padding: '0 4px',
      }}>
        <div style={{
          fontSize: 9,
          color: '#a78bfa',
          lineHeight: 1.5,
          fontFamily: isMobile ? fontFamily : undefined,
        }}>
          {hintText}
        </div>
      </div>
    );
  }

  if (feedOrder < 0) {
    return (
      <div style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        <div style={{
          width: 12,
          height: 1,
          background: isMobile ? colors.muted : '#e5e7eb',
        }} />
      </div>
    );
  }

  // Empty future cell: nothing
  return <div style={{ flex: 1 }} />;
}
