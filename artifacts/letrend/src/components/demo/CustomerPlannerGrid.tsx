import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  ArrowDown,
  ArrowUp,
  CalendarDays,
  ExternalLink,
  Heart,
  MessageCircle,
  Play,
  RotateCcw,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";

export type CustomerPlannerSlot = {
  feedOrder: number;
  title: string;
  source?: "letrend" | "tiktok" | "imported_history";
  tag?: string | null;
  thumbnailUrl?: string | null;
  publishedAt?: string | null;
  views?: number | null;
  likes?: number | null;
  comments?: number | null;
  description?: string | null;
  headline?: string | null;
  whyWorks?: string | null;
  whyFits?: string | null;
  originalUrl?: string | null;
};

const CURRENT_SLOT_INDEX = 4;
const TOTAL_SLOTS = 9;
const WINDOW_STEP = 3;
const MAX_WINDOW_OFFSET = 3;
const MIN_WINDOW_OFFSET = -9;

type GridCell = {
  slotIndex: number;
  feedOrder: number;
  slot: CustomerPlannerSlot | null;
};

function buildSlotMap(slots: CustomerPlannerSlot[], windowOffset: number): GridCell[] {
  return Array.from({ length: TOTAL_SLOTS }, (_, slotIndex) => {
    const feedOrder = CURRENT_SLOT_INDEX - slotIndex + windowOffset;
    return {
      slotIndex,
      feedOrder,
      slot: slots.find((s) => s.feedOrder === feedOrder) ?? null,
    };
  });
}

function formatCompact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(".0", "")}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(".0", "")}k`;
  return String(n);
}

function formatDateShort(iso?: string | null): string | null {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleDateString("sv-SE", { day: "numeric", month: "short" });
  } catch {
    return null;
  }
}

function TikTokGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden className={className} fill="currentColor">
      <path d="M22.5 3h-4.2v17.6c0 2-1.6 3.6-3.6 3.6s-3.6-1.6-3.6-3.6 1.6-3.6 3.6-3.6c.4 0 .7 0 1 .1v-4.3c-.3 0-.7-.1-1-.1-4.4 0-7.9 3.6-7.9 7.9s3.6 7.9 7.9 7.9 7.9-3.6 7.9-7.9V11.5c1.6 1.1 3.5 1.8 5.6 1.8V9c-2 0-3.8-.8-5.1-2.2-1-1-1.6-2.4-1.6-3.8z" />
    </svg>
  );
}

function LeTMonogram({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center justify-center font-serif-display font-black tracking-tight",
        className,
      )}
    >
      LeT
    </span>
  );
}

// ── Custom hover popup — works in iframe + any overflow:hidden context ────────

function HoverTrigger({
  children,
  popup,
}: {
  children: React.ReactNode;
  popup: React.ReactNode;
}) {
  const [visible, setVisible] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const ref = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function open() {
    timer.current = setTimeout(() => {
      if (!ref.current) return;
      const rect = ref.current.getBoundingClientRect();
      const popupW = 288;
      const flipLeft = rect.right + popupW + 12 > window.innerWidth;
      setPos({
        top: Math.min(rect.top, window.innerHeight - 340),
        left: flipLeft ? rect.left - popupW - 10 : rect.right + 10,
      });
      setVisible(true);
    }, 130);
  }

  function close() {
    if (timer.current) clearTimeout(timer.current);
    setVisible(false);
  }

  return (
    <div ref={ref} onMouseEnter={open} onMouseLeave={close} className="contents">
      {children}
      {visible &&
        createPortal(
          <div
            style={{ position: "fixed", top: pos.top, left: pos.left, zIndex: 9999, width: 288 }}
            onMouseEnter={open}
            onMouseLeave={close}
            className="rounded-xl border-2 border-foreground bg-card p-4 shadow-hard"
          >
            {popup}
          </div>,
          document.body,
        )}
    </div>
  );
}

// ── Grid ─────────────────────────────────────────────────────────────────────

export function CustomerPlannerGrid({
  slots,
  companyName,
}: {
  slots: CustomerPlannerSlot[];
  companyName?: string;
}) {
  const [windowOffset, setWindowOffset] = useState(0);
  const cellMap = buildSlotMap(slots, windowOffset);

  const hasNearbyUpcoming = slots.some((s) => s.feedOrder > 0);
  const canGoForward = windowOffset < MAX_WINDOW_OFFSET;
  const canGoBack = windowOffset > MIN_WINDOW_OFFSET;
  const isOffCenter = windowOffset !== 0;

  return (
    <div className="relative w-full">
      <div className="grid grid-cols-3 gap-2 select-none md:gap-2.5">
        {cellMap.map((cell) => (
          <PlannerCell
            key={cell.slotIndex}
            cell={cell}
            hasNearbyUpcoming={hasNearbyUpcoming}
            companyName={companyName}
          />
        ))}
      </div>

      <div className="mt-5 flex items-center justify-center gap-3">
        <button
          type="button"
          onClick={() => setWindowOffset((o) => Math.min(o + WINDOW_STEP, MAX_WINDOW_OFFSET))}
          disabled={!canGoForward}
          className="inline-flex items-center gap-2 rounded-full border-2 border-foreground bg-card px-4 py-1.5 text-[11px] font-bold uppercase tracking-wider text-foreground shadow-hard-sm transition-all hover:translate-y-[1px] hover:shadow-none disabled:opacity-30 disabled:hover:translate-y-0 disabled:hover:shadow-hard-sm"
        >
          <ArrowUp className="h-3 w-3" /> Framåt
        </button>

        {isOffCenter && (
          <button
            type="button"
            onClick={() => setWindowOffset(0)}
            className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-foreground/40 bg-transparent px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground transition-colors hover:text-foreground"
          >
            <RotateCcw className="h-3 w-3" /> Nu
          </button>
        )}

        <button
          type="button"
          onClick={() => setWindowOffset((o) => Math.max(o - WINDOW_STEP, MIN_WINDOW_OFFSET))}
          disabled={!canGoBack}
          className="inline-flex items-center gap-2 rounded-full border-2 border-foreground bg-card px-4 py-1.5 text-[11px] font-bold uppercase tracking-wider text-foreground shadow-hard-sm transition-all hover:translate-y-[1px] hover:shadow-none disabled:opacity-30 disabled:hover:translate-y-0 disabled:hover:shadow-hard-sm"
        >
          Bakåt <ArrowDown className="h-3 w-3" />
        </button>
      </div>
    </div>
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

  if (!slot) {
    if (isNow) return <NowEmptyCell hasNearbyUpcoming={hasNearbyUpcoming} />;
    return <EmptyLetCard variant={isPast ? "past" : "future"} />;
  }

  const isHistory = isPast || slot.source === "tiktok" || slot.source === "imported_history";

  const cardEl = isHistory ? (
    <HistoryCard slot={slot} isNow={isNow} />
  ) : (
    <UpcomingCard slot={slot} isNow={isNow} />
  );

  return (
    <HoverTrigger popup={<ConceptPopup slot={slot} companyName={companyName} isHistory={isHistory} />}>
      {cardEl}
    </HoverTrigger>
  );
}

// ── Upcoming / NU card (LeT) ──────────────────────────────────────────────────

function UpcomingCard({ slot, isNow }: { slot: CustomerPlannerSlot; isNow: boolean }) {
  const thumb = slot.thumbnailUrl ?? null;
  const hasThumb = Boolean(thumb);
  const headline = slot.headline ?? slot.title;
  const dateStr = formatDateShort(slot.publishedAt);

  return (
    <div
      className={cn(
        "group relative flex aspect-[9/16] cursor-pointer flex-col overflow-hidden rounded-xl box-border transition-shadow",
        isNow
          ? "border-2 border-accent shadow-hard-sm"
          : "border-2 border-foreground/80 hover:shadow-hard-sm",
        !hasThumb && (isNow ? "bg-blush" : "bg-gradient-to-br from-card via-card to-blush/40"),
      )}
      style={
        hasThumb
          ? {
              backgroundImage: `linear-gradient(to bottom, rgba(0,0,0,0.18) 0%, rgba(0,0,0,0.72) 100%), url(${thumb})`,
              backgroundSize: "cover",
              backgroundPosition: "center",
            }
          : undefined
      }
    >
      <div className="flex items-start justify-between p-2.5">
        <span
          className={cn(
            "inline-flex h-6 items-center gap-1 rounded-full px-2 text-[10px] font-black uppercase tracking-wider",
            hasThumb ? "bg-black/55 text-white" : "bg-foreground text-background",
          )}
        >
          <Sparkles className="h-2.5 w-2.5" /> LeT
        </span>
        {isNow ? (
          <span className="rounded-full bg-accent px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-accent-foreground">
            Nu
          </span>
        ) : dateStr ? (
          <span
            className={cn(
              "rounded-full px-2 py-0.5 text-[9px] font-semibold",
              hasThumb
                ? "bg-black/45 text-white/90"
                : "bg-card text-muted-foreground border border-border",
            )}
          >
            {dateStr}
          </span>
        ) : null}
      </div>

      {!hasThumb && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <LeTMonogram className="text-5xl text-foreground/[0.06]" />
        </div>
      )}

      <div className="mt-auto p-2.5">
        <h5
          className={cn(
            "font-serif-display text-[13px] font-bold leading-snug md:text-sm",
            hasThumb ? "text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.7)]" : "text-foreground",
          )}
          style={{
            display: "-webkit-box",
            WebkitLineClamp: 3,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
          }}
        >
          {headline}
        </h5>
        {slot.tag && (
          <p
            className={cn(
              "mt-1 text-[10px] font-medium",
              hasThumb ? "text-white/75" : "text-muted-foreground",
            )}
          >
            #{slot.tag}
          </p>
        )}
      </div>
    </div>
  );
}

// ── History card ──────────────────────────────────────────────────────────────

function HistoryCard({ slot, isNow }: { slot: CustomerPlannerSlot; isNow: boolean }) {
  const thumb = slot.thumbnailUrl ?? null;
  const hasThumb = Boolean(thumb);
  const caption =
    slot.description?.trim() ||
    (slot.title && slot.title !== "TikTok-klipp" ? slot.title : "");
  const dateStr = formatDateShort(slot.publishedAt);

  return (
    <div
      className={cn(
        "group relative flex aspect-[9/16] cursor-pointer flex-col overflow-hidden rounded-xl box-border transition-shadow",
        isNow
          ? "border-2 border-accent shadow-hard-sm"
          : "border-2 border-foreground/40 hover:shadow-hard-sm",
        !hasThumb && "bg-muted/40",
      )}
      style={
        hasThumb
          ? {
              backgroundImage: `linear-gradient(to bottom, rgba(0,0,0,0.05) 0%, rgba(0,0,0,0.82) 100%), url(${thumb})`,
              backgroundSize: "cover",
              backgroundPosition: "center",
            }
          : undefined
      }
    >
      <div className="flex items-start justify-end p-2.5">
        <TikTokGlyph
          className={cn(
            "h-5 w-5 drop-shadow-[0_1px_2px_rgba(0,0,0,0.55)]",
            hasThumb ? "text-white" : "text-foreground",
          )}
        />
      </div>

      <div className="flex-1" />

      {(caption || dateStr) && (
        <div className="px-2.5 pb-1.5">
          <div className="flex items-end gap-2">
            {caption ? (
              <p
                className={cn(
                  "flex-1 text-[11px] font-medium leading-snug",
                  hasThumb
                    ? "text-white [text-shadow:0_1px_2px_rgba(0,0,0,0.7)]"
                    : "text-foreground",
                )}
                style={{
                  display: "-webkit-box",
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: "vertical",
                  overflow: "hidden",
                }}
              >
                {caption}
              </p>
            ) : (
              <span className="flex-1" />
            )}
            {dateStr && (
              <span
                className={cn(
                  "shrink-0 inline-flex items-center gap-0.5 text-[9px] font-semibold tabular-nums",
                  hasThumb ? "text-white/85" : "text-muted-foreground",
                )}
              >
                <CalendarDays className="h-2.5 w-2.5" />
                {dateStr}
              </span>
            )}
          </div>
        </div>
      )}

      <div
        className={cn(
          "grid grid-cols-3 border-t text-center",
          hasThumb
            ? "border-white/15 bg-black/25 backdrop-blur-[2px]"
            : "border-border bg-card/80",
        )}
      >
        <StatPill icon={<Play className="h-2.5 w-2.5" />} value={slot.views} onThumb={hasThumb} />
        <StatPill
          icon={<Heart className="h-2.5 w-2.5" />}
          value={slot.likes}
          onThumb={hasThumb}
          divider
        />
        <StatPill
          icon={<MessageCircle className="h-2.5 w-2.5" />}
          value={slot.comments}
          onThumb={hasThumb}
          divider
        />
      </div>
    </div>
  );
}

function StatPill({
  icon,
  value,
  onThumb,
  divider,
}: {
  icon: React.ReactNode;
  value: number | null | undefined;
  onThumb: boolean;
  divider?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-0.5 py-1.5",
        divider && (onThumb ? "border-l border-white/20" : "border-l border-border"),
      )}
    >
      <span className={onThumb ? "text-white/80" : "text-muted-foreground"}>{icon}</span>
      <span
        className={cn(
          "text-[10px] font-bold leading-none tabular-nums",
          onThumb ? "text-white" : "text-foreground",
        )}
      >
        {typeof value === "number" ? formatCompact(value) : "—"}
      </span>
    </div>
  );
}

// ── Hover popup ───────────────────────────────────────────────────────────────

function ConceptPopup({
  slot,
  companyName,
  isHistory,
}: {
  slot: CustomerPlannerSlot;
  companyName?: string;
  isHistory: boolean;
}) {
  const headline =
    slot.headline ?? (slot.title !== "TikTok-klipp" ? slot.title : null);
  const whyFitsLabel = companyName ? `Varför det passar ${companyName}` : "Varför det passar er";
  const caption = slot.description?.trim() || null;
  const dateStr = formatDateShort(slot.publishedAt);
  const hasAnyDetail =
    headline ||
    caption ||
    slot.whyWorks ||
    slot.whyFits ||
    slot.originalUrl ||
    slot.views != null ||
    slot.likes != null ||
    slot.comments != null;

  return (
    <div className="space-y-3 text-foreground">
      <div className="flex items-start justify-between gap-2">
        <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">
          {isHistory ? "TikTok-historik" : "LeTrend-koncept"}
        </span>
        {dateStr && (
          <span className="text-[9px] font-semibold tabular-nums text-muted-foreground">
            {dateStr}
          </span>
        )}
      </div>

      {headline ? (
        <h4 className="font-serif-display text-sm font-bold leading-snug">{headline}</h4>
      ) : !hasAnyDetail ? (
        <p className="text-xs italic text-muted-foreground">
          {isHistory
            ? "Inget tillgängligt om detta klipp."
            : "Konceptet är under bearbetning."}
        </p>
      ) : null}

      {isHistory && caption && (
        <p className="text-xs leading-snug text-foreground/85">{caption}</p>
      )}

      {isHistory && (slot.views != null || slot.likes != null || slot.comments != null) && (
        <div className="flex gap-3 rounded-md border border-border bg-muted/50 px-3 py-2 text-[11px] text-foreground/80">
          {slot.views != null && (
            <span className="inline-flex items-center gap-1">
              <Play className="h-3 w-3" /> {formatCompact(slot.views)}
            </span>
          )}
          {slot.likes != null && (
            <span className="inline-flex items-center gap-1">
              <Heart className="h-3 w-3" /> {formatCompact(slot.likes)}
            </span>
          )}
          {slot.comments != null && (
            <span className="inline-flex items-center gap-1">
              <MessageCircle className="h-3 w-3" /> {formatCompact(slot.comments)}
            </span>
          )}
        </div>
      )}

      {slot.whyWorks && <PopupBlock label="Varför det fungerar" body={slot.whyWorks} />}
      {slot.whyFits && <PopupBlock label={whyFitsLabel} body={slot.whyFits} />}

      {slot.originalUrl && (
        <a
          href={slot.originalUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="inline-flex items-center gap-1.5 rounded-full border border-foreground/70 bg-background px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-foreground transition-colors hover:bg-foreground hover:text-background"
        >
          {isHistory ? "Originalklipp" : "Inspiration"}{" "}
          <ExternalLink className="h-3 w-3" />
        </a>
      )}
    </div>
  );
}

function PopupBlock({ label, body }: { label: string; body: string }) {
  return (
    <div>
      <p className="text-[9px] font-bold uppercase tracking-widest text-accent">{label}</p>
      <p className="mt-0.5 text-[11px] leading-snug text-foreground/85">{body}</p>
    </div>
  );
}

// ── Empty cells ───────────────────────────────────────────────────────────────

function NowEmptyCell({ hasNearbyUpcoming }: { hasNearbyUpcoming: boolean }) {
  return (
    <div className="flex aspect-[9/16] flex-col items-center justify-center rounded-xl border-2 border-dashed border-accent/60 bg-blush/60 p-3 text-center">
      <span className="text-xs font-medium leading-snug text-accent">
        {hasNearbyUpcoming
          ? "Nästa steg är klart i din plan"
          : "Nästa steg förbereds av din CM"}
      </span>
    </div>
  );
}

function EmptyLetCard({ variant }: { variant: "past" | "future" }) {
  return (
    <div
      className={cn(
        "flex aspect-[9/16] items-center justify-center rounded-xl border border-dashed",
        variant === "past"
          ? "border-foreground/15 bg-muted/20"
          : "border-foreground/20 bg-card/40",
      )}
    >
      <LeTMonogram className="text-base text-foreground/25 md:text-lg" />
    </div>
  );
}
