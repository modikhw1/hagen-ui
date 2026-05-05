import { ArrowDown, ArrowUp, ExternalLink, RotateCcw } from 'lucide-react';
import type { ReactNode } from 'react';
import { useMemo, useState } from 'react';

export type CustomerPlannerSlot = {
  feedOrder: number;
  title: string;
  source?: 'letrend' | 'tiktok' | 'imported_history';
  tag?: string | null;
  thumbnailUrl?: string | null;
  publishedAt?: string | null;
  views?: number | null;
  headline?: string | null;
  whyWorks?: string | null;
  whyFits?: string | null;
  originalUrl?: string | null;
};

type GridCell = {
  slotIndex: number;
  feedOrder: number;
  slot: CustomerPlannerSlot | null;
};

const CURRENT_SLOT_INDEX = 4;
const TOTAL_SLOTS = 9;
const WINDOW_STEP = 3;
const MAX_WINDOW_OFFSET = 12;
const MIN_WINDOW_OFFSET = -12;

const palette = {
  ink: '#1F1A14',
  cream: '#FAF8F5',
  paper: '#FFFFFF',
  muted: '#7D6E5D',
  brown: '#4A2F18',
  caramel: '#C9A961',
  blush: '#F4E4D8',
  line: 'rgba(74, 47, 24, 0.16)',
};

function buildSlotMap(slots: CustomerPlannerSlot[], windowOffset: number): GridCell[] {
  return Array.from({ length: TOTAL_SLOTS }, (_, slotIndex) => {
    const feedOrder = CURRENT_SLOT_INDEX - slotIndex + windowOffset;
    return {
      slotIndex,
      feedOrder,
      slot: slots.find((item) => item.feedOrder === feedOrder) ?? null,
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
  companyName,
}: {
  slots: CustomerPlannerSlot[];
  companyName?: string;
}) {
  const [windowOffset, setWindowOffset] = useState(0);
  const cellMap = useMemo(() => buildSlotMap(slots, windowOffset), [slots, windowOffset]);
  const hasNearbyUpcoming = slots.some((slot) => slot.feedOrder > 0);
  const canGoForward = windowOffset < MAX_WINDOW_OFFSET;
  const canGoBack = windowOffset > MIN_WINDOW_OFFSET;
  const isOffCenter = windowOffset !== 0;

  return (
    <div style={{ width: '100%' }}>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
          gap: 10,
          userSelect: 'none',
        }}
      >
        {cellMap.map((cell) => (
          <PlannerCell
            key={cell.slotIndex}
            cell={cell}
            hasNearbyUpcoming={hasNearbyUpcoming}
            companyName={companyName}
          />
        ))}
      </div>

      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          gap: 10,
          marginTop: 18,
          flexWrap: 'wrap',
        }}
      >
        <PlannerButton
          disabled={!canGoForward}
          onClick={() => setWindowOffset((current) => Math.min(current + WINDOW_STEP, MAX_WINDOW_OFFSET))}
        >
          <ArrowUp size={13} /> Framåt
        </PlannerButton>

        {isOffCenter ? (
          <button
            type="button"
            onClick={() => setWindowOffset(0)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              border: `1px dashed ${palette.line}`,
              background: 'transparent',
              color: palette.muted,
              borderRadius: 999,
              padding: '7px 11px',
              fontSize: 11,
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              cursor: 'pointer',
            }}
          >
            <RotateCcw size={12} /> Nu
          </button>
        ) : null}

        <PlannerButton
          disabled={!canGoBack}
          onClick={() => setWindowOffset((current) => Math.max(current - WINDOW_STEP, MIN_WINDOW_OFFSET))}
        >
          Bakåt <ArrowDown size={13} />
        </PlannerButton>
      </div>
    </div>
  );
}

function PlannerButton({
  disabled,
  onClick,
  children,
}: {
  disabled: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 7,
        border: `1px solid ${palette.line}`,
        background: palette.paper,
        color: palette.brown,
        borderRadius: 999,
        padding: '8px 14px',
        fontSize: 11,
        fontWeight: 800,
        textTransform: 'uppercase',
        letterSpacing: '0.06em',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.4 : 1,
        boxShadow: '0 8px 18px rgba(74, 47, 24, 0.08)',
      }}
    >
      {children}
    </button>
  );
}

function PlannerCell({
  cell,
  hasNearbyUpcoming,
  companyName,
}: {
  cell: GridCell;
  hasNearbyUpcoming: boolean;
  companyName?: string;
}) {
  const { feedOrder, slot } = cell;
  const isNow = feedOrder === 0;
  const isPast = feedOrder < 0;
  const depth = isPast ? Math.abs(feedOrder) : 0;
  const thumbnailUrl = slot?.thumbnailUrl ?? null;
  const hasThumbnail = Boolean(thumbnailUrl);
  const opacity = isPast ? Math.max(0.5, 1 - depth * 0.11) : 1;
  const interactive = Boolean(slot && (slot.headline || slot.whyWorks || slot.whyFits || slot.title));

  return (
    <div
      className="demo-planner-cell"
      style={{
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        aspectRatio: '9 / 16',
        overflow: 'hidden',
        borderRadius: 18,
        padding: 12,
        opacity,
        cursor: interactive ? 'pointer' : 'default',
        border: isNow ? `2px solid ${palette.caramel}` : `1px solid ${slot ? 'rgba(74,47,24,0.34)' : palette.line}`,
        background: hasThumbnail
          ? undefined
          : isNow
            ? palette.blush
            : isPast
              ? 'rgba(74,47,24,0.04)'
              : palette.paper,
        backgroundImage: hasThumbnail
          ? `linear-gradient(to bottom, rgba(0,0,0,0.18), rgba(0,0,0,0.68)), url(${thumbnailUrl})`
          : undefined,
        backgroundSize: hasThumbnail ? 'cover' : undefined,
        backgroundPosition: hasThumbnail ? 'center' : undefined,
        boxShadow: isNow ? '0 14px 30px rgba(74,47,24,0.14)' : '0 8px 22px rgba(74,47,24,0.08)',
      }}
    >
      {slot ? (
        <>
          <FilledCell slot={slot} isNow={isNow} hasThumbnail={hasThumbnail} />
          {interactive ? <ConceptHoverDetails slot={slot} companyName={companyName} /> : null}
        </>
      ) : (
        <EmptyCell feedOrder={feedOrder} isNow={isNow} hasNearbyUpcoming={hasNearbyUpcoming} />
      )}
    </div>
  );
}

function FilledCell({
  slot,
  isNow,
  hasThumbnail,
}: {
  slot: CustomerPlannerSlot;
  isNow: boolean;
  hasThumbnail: boolean;
}) {
  const isImported = slot.source === 'tiktok' || slot.source === 'imported_history';
  const badgeText = isNow ? 'Nu' : isImported ? 'TT' : 'LeT';
  const titleColor = hasThumbnail ? '#fff' : palette.ink;
  const metaColor = hasThumbnail ? 'rgba(255,255,255,0.76)' : palette.muted;

  return (
    <div
      className="demo-planner-face"
      style={{
        position: 'relative',
        zIndex: 1,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        height: '100%',
        transition: 'opacity 150ms ease',
      }}
    >
      <span
        style={{
          alignSelf: 'flex-start',
          borderRadius: 999,
          padding: '4px 8px',
          background: hasThumbnail ? 'rgba(0,0,0,0.44)' : isImported ? palette.blush : palette.brown,
          color: hasThumbnail ? '#fff' : isImported ? palette.brown : palette.cream,
          fontSize: 10,
          fontWeight: 900,
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
        }}
      >
        {badgeText}
      </span>

      <div
        style={{
          color: titleColor,
          fontSize: 13,
          fontWeight: 800,
          lineHeight: 1.18,
          textShadow: hasThumbnail ? '0 1px 3px rgba(0,0,0,0.65)' : undefined,
          display: '-webkit-box',
          WebkitLineClamp: 5,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
        }}
      >
        {slot.title}
      </div>

      <div style={{ color: metaColor, fontSize: 11, lineHeight: 1.2 }}>
        {isImported && slot.publishedAt ? (
          <div>
            {new Date(slot.publishedAt).toLocaleDateString('sv-SE', {
              month: 'short',
              year: 'numeric',
            })}
          </div>
        ) : null}
        {typeof slot.views === 'number' ? <div>{formatCompactViews(slot.views)} visn.</div> : null}
        {!isImported && slot.tag && !hasThumbnail ? <div>#{slot.tag}</div> : null}
      </div>
    </div>
  );
}

function ConceptHoverDetails({
  slot,
  companyName,
}: {
  slot: CustomerPlannerSlot;
  companyName?: string;
}) {
  const headline = slot.headline ?? slot.title;
  const whyFitsLabel = companyName ? `Varför det passar ${companyName}` : 'Varför det passar er';

  return (
    <div
      className="demo-planner-details"
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 2,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        overflowY: 'auto',
        borderRadius: 16,
        background: 'rgba(255,255,255,0.97)',
        color: palette.ink,
        padding: 14,
        opacity: 0,
        pointerEvents: 'none',
        transition: 'opacity 150ms ease',
        backdropFilter: 'blur(6px)',
      }}
    >
      <h4 style={{ margin: 0, fontSize: 15, lineHeight: 1.15, fontFamily: 'var(--app-font-serif)', color: palette.brown }}>
        {headline}
      </h4>

      {slot.whyWorks ? (
        <HoverBlock label="Varför det fungerar" body={slot.whyWorks} />
      ) : null}

      {slot.whyFits ? (
        <HoverBlock label={whyFitsLabel} body={slot.whyFits} />
      ) : null}

      {slot.originalUrl ? (
        <a
          href={slot.originalUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(event) => event.stopPropagation()}
          style={{
            marginTop: 'auto',
            display: 'inline-flex',
            alignItems: 'center',
            alignSelf: 'flex-start',
            gap: 6,
            borderRadius: 999,
            border: `1px solid ${palette.line}`,
            background: palette.cream,
            color: palette.brown,
            padding: '7px 10px',
            fontSize: 10,
            fontWeight: 900,
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            textDecoration: 'none',
          }}
        >
          TikTok <ExternalLink size={12} />
        </a>
      ) : null}
    </div>
  );
}

function HoverBlock({ label, body }: { label: string; body: string }) {
  return (
    <div>
      <p
        style={{
          margin: 0,
          color: palette.caramel,
          fontSize: 9,
          fontWeight: 900,
          textTransform: 'uppercase',
          letterSpacing: '0.1em',
        }}
      >
        {label}
      </p>
      <p style={{ margin: '3px 0 0', color: 'rgba(31,26,20,0.82)', fontSize: 12, lineHeight: 1.35 }}>
        {body}
      </p>
    </div>
  );
}

function EmptyCell({
  feedOrder,
  isNow,
  hasNearbyUpcoming,
}: {
  feedOrder: number;
  isNow: boolean;
  hasNearbyUpcoming: boolean;
}) {
  if (isNow) {
    return (
      <div
        style={{
          display: 'flex',
          height: '100%',
          alignItems: 'center',
          justifyContent: 'center',
          textAlign: 'center',
          color: palette.brown,
          fontSize: 12,
          fontWeight: 800,
          lineHeight: 1.25,
        }}
      >
        {hasNearbyUpcoming ? 'Nästa steg är klart i planen' : 'Nästa steg förbereds av er CM'}
      </div>
    );
  }

  if (feedOrder < 0) {
    return (
      <div style={{ display: 'flex', flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: 18, height: 1, background: palette.line }} />
      </div>
    );
  }

  return <div style={{ flex: 1 }} />;
}
