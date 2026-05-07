import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ExternalLink, Heart, MessageCircle, Play, RotateCcw, ArrowDown, ArrowUp } from "lucide-react";
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

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("sv-SE", { day: "numeric", month: "short" });
}

function TikTokGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={className} fill="currentColor">
      <path d="M19.5 6.6c-1.6-.3-2.9-1.3-3.6-2.6-.3-.5-.4-1-.4-1.5V2h-3.2v12.6c0 1.4-1.1 2.5-2.5 2.5S7.3 16 7.3 14.6 8.4 12 9.8 12c.3 0 .6 0 .8.1V8.8c-.3 0-.5-.1-.8-.1-3.1 0-5.7 2.5-5.7 5.7s2.5 5.7 5.7 5.7 5.7-2.5 5.7-5.7V9.6c1.1.7 2.4 1.1 3.8 1.1V7.5c-.1 0 0-.6.2-.9z" />
    </svg>
  );
}

const LET_LOGO_SRC = `${import.meta.env.BASE_URL}let-logo.png`;

function LeTBadge({ onThumb, size = "md" }: { onThumb?: boolean; size?: "sm" | "md" | "lg" }) {
  return (
    <img
      src={LET_LOGO_SRC}
      alt="LeTrend"
      className={cn(
        "object-contain flex-shrink-0 pointer-events-none select-none",
        onThumb ? "brightness-0 invert opacity-60" : "opacity-40",
        size === "sm" && "h-5 w-5",
        size === "md" && "h-7 w-7",
        size === "lg" && "h-10 w-10",
      )}
    />
  );
}

// ── Custom hover popup — positioned at mouse cursor, works in iframe + any overflow context ──

function HoverTrigger({
  children,
  popup,
}: {
  children: React.ReactNode;
  popup: React.ReactNode;
}) {
  const [visible, setVisible] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function open(e: React.MouseEvent) {
    const mx = e.clientX;
    const my = e.clientY;
    timer.current = setTimeout(() => {
      const popupW = 288;
      const popupH = 340;
      const flipLeft = mx + popupW + 16 > window.innerWidth;
      const top = Math.min(my - 8, window.innerHeight - popupH - 8);
      const left = flipLeft ? mx - popupW - 10 : mx + 14;
      setPos({ top: Math.max(8, top), left });
      setVisible(true);
    }, 120);
  }

  function close() {
    if (timer.current) clearTimeout(timer.current);
    setVisible(false);
  }

  return (
    <div onMouseEnter={open} onMouseLeave={close} className="contents">
      {children}
      {visible &&
        createPortal(
          <div
            style={{ position: "fixed", top: pos.top, left: pos.left, zIndex: 9999, width: 288 }}
            onMouseEnter={(e) => { if (timer.current) clearTimeout(timer.current); }}
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

  const hasPopup = !isHistory
    ? true
    : Boolean(slot.originalUrl || slot.headline || slot.whyWorks || slot.whyFits || slot.views != null || slot.description);

  const cardEl = isHistory ? (
    <HistoryCard slot={slot} isNow={isNow} />
  ) : (
    <UpcomingCard slot={slot} isNow={isNow} />
  );

  if (!hasPopup) return cardEl;

  return (
    <HoverTrigger popup={<ConceptPopup slot={slot} companyName={companyName} isHistory={isHistory} />}>
      {cardEl}
    </HoverTrigger>
  );
}

function UpcomingCard({ slot, isNow }: { slot: CustomerPlannerSlot; isNow: boolean }) {
  const thumb = slot.thumbnailUrl ?? null;
  const hasThumb = Boolean(thumb);
  const displayTitle = slot.headline ?? (slot.title !== "TikTok-klipp" ? slot.title : "");
  const dateStr = slot.publishedAt ? fmtDate(slot.publishedAt) : null;

  return (
    <div
      className={cn(
        "group relative flex aspect-[9/16] cursor-pointer flex-col overflow-hidden rounded-xl box-border transition-shadow",
        isNow
          ? "border-2 border-accent shadow-hard-sm"
          : "border-2 border-foreground/70 hover:shadow-hard-sm",
        !hasThumb && (isNow ? "bg-blush" : "bg-card"),
      )}
      style={
        hasThumb
          ? {
              backgroundImage: `linear-gradient(to bottom, rgba(0,0,0,0.08) 0%, rgba(0,0,0,0.68) 100%), url(${thumb})`,
              backgroundSize: "cover",
              backgroundPosition: "center",
            }
          : undefined
      }
    >
      <div className="flex items-start justify-between p-2.5">
        <LeTBadge onThumb={hasThumb} size="sm" />
        {isNow && (
          <span className="rounded-full bg-accent px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-accent-foreground">
            Nu
          </span>
        )}
      </div>

      <div className="flex-1" />

      <div className="px-2.5 pb-2.5 space-y-1.5">
        {displayTitle && (
          <p
            className={cn(
              "text-xs font-bold leading-snug",
              hasThumb ? "text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.7)]" : "text-foreground",
            )}
            style={{ display: "-webkit-box", WebkitLineClamp: 4, WebkitBoxOrient: "vertical", overflow: "hidden" }}
          >
            {displayTitle}
          </p>
        )}
        <div className="flex items-center justify-between gap-1">
          {slot.tag && (
            <span className={cn("text-[9px]", hasThumb ? "text-white/60" : "text-muted-foreground")}>
              #{slot.tag}
            </span>
          )}
          {dateStr && (
            <span className={cn("text-[9px] ml-auto tabular-nums", hasThumb ? "text-white/55" : "text-muted-foreground")}>
              {dateStr}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function HistoryCard({ slot, isNow }: { slot: CustomerPlannerSlot; isNow: boolean }) {
  const thumb = slot.thumbnailUrl ?? null;
  const hasThumb = Boolean(thumb);

  const rawTitle = slot.title ?? "";
  const isPlaceholder = rawTitle === "TikTok-klipp" || rawTitle.startsWith("http");
  const caption =
    slot.description?.trim() ||
    (!isPlaceholder ? rawTitle : "");

  const dateStr = slot.publishedAt ? fmtDate(slot.publishedAt) : null;

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
              backgroundImage: `linear-gradient(to bottom, rgba(0,0,0,0) 25%, rgba(0,0,0,0.84) 100%), url(${thumb})`,
              backgroundSize: "cover",
              backgroundPosition: "center",
            }
          : undefined
      }
    >
      <div className="p-2.5">
        <TikTokGlyph
          className={cn("h-4 w-4", hasThumb ? "text-white/60" : "text-foreground/35")}
        />
      </div>

      <div className="flex-1" />

      <div>
        {(caption || dateStr) && (
          <div className="px-2.5 pb-1.5">
            {caption && (
              <p
                className={cn(
                  "text-[11px] font-medium leading-snug",
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
            )}
            {dateStr && (
              <p
                className={cn(
                  "text-[9px] mt-0.5 tabular-nums",
                  hasThumb ? "text-white/55" : "text-muted-foreground",
                )}
              >
                {dateStr}
              </p>
            )}
          </div>
        )}

        <div
          className={cn(
            "grid grid-cols-3 border-t text-center",
            hasThumb
              ? "border-white/20 bg-black/35 backdrop-blur-[2px]"
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
      <span className={onThumb ? "text-white/70" : "text-muted-foreground"}>{icon}</span>
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

function ConceptPopup({
  slot,
  companyName,
  isHistory,
}: {
  slot: CustomerPlannerSlot;
  companyName?: string;
  isHistory: boolean;
}) {
  const headline = slot.headline ?? (slot.title !== "TikTok-klipp" && !slot.title?.startsWith("http") ? slot.title : null);
  const caption = slot.description?.trim() || null;
  const whyFitsLabel = companyName ? `Varför det passar ${companyName}` : "Varför det passar er";
  const dateStr = slot.publishedAt ? fmtDate(slot.publishedAt) : null;

  return (
    <div className="space-y-3 text-foreground">
      {!isHistory && (
        <div className="flex items-center gap-2 pb-1 border-b border-border">
          <LeTBadge size="sm" />
          <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">
            LeTrend-koncept
          </span>
        </div>
      )}

      {headline && (
        <h4 className="text-sm font-bold leading-snug text-foreground">{headline}</h4>
      )}

      {isHistory && caption && (
        <p className="text-xs leading-snug text-foreground/80">{caption}</p>
      )}

      {!isHistory && dateStr && (
        <p className="text-[10px] text-muted-foreground">
          <span className="font-semibold">Planerat:</span> {dateStr}
        </p>
      )}

      {!isHistory && !slot.whyWorks && !slot.whyFits && !headline && (
        <p className="text-xs text-foreground/60 leading-snug">
          Konceptet förbereds av din content manager.
        </p>
      )}

      {slot.whyWorks && <PopupBlock label="Varför det fungerar" body={slot.whyWorks} />}
      {slot.whyFits && <PopupBlock label={whyFitsLabel} body={slot.whyFits} />}

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

      {slot.originalUrl && (
        <a
          href={slot.originalUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="inline-flex items-center gap-1.5 rounded-full border border-foreground/70 bg-background px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-foreground transition-colors hover:bg-foreground hover:text-background"
        >
          {isHistory ? "Öppna på TikTok" : "Inspiration"}{" "}
          <ExternalLink className="h-3 w-3" />
        </a>
      )}
    </div>
  );
}

function PopupBlock({ label, body }: { label: string; body: string }) {
  return (
    <div>
      <p className="text-[9px] font-bold uppercase tracking-widest text-accent-foreground/70">
        {label}
      </p>
      <p className="mt-0.5 text-[11px] leading-snug text-foreground/85">{body}</p>
    </div>
  );
}

function NowEmptyCell({ hasNearbyUpcoming }: { hasNearbyUpcoming: boolean }) {
  return (
    <div className="flex aspect-[9/16] flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-accent/50 bg-blush/50 p-3 text-center">
      <LeTBadge size="md" />
      <span className="text-[11px] font-medium leading-snug text-foreground/60">
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
      <LeTBadge size="md" />
    </div>
  );
}

