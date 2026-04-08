import type { CustomerConcept, FeedSlot, GridConfig } from '@/types/studio-v2';

export function buildSlotMap(
  concepts: CustomerConcept[],
  gridConfig: GridConfig,
  historyOffset = 0
): FeedSlot[] {
  const totalSlots = gridConfig.columns * gridConfig.rows;
  // Canonical orientation: slot 0 (top-left) = highest feedOrder (kommande),
  // center slot (currentSlotIndex=4) = feedOrder 0 (nu),
  // last slot (bottom-right) = most negative feedOrder (historik).
  // historyOffset > 0 shifts the entire window deeper into historik.
  return Array.from({ length: totalSlots }, (_, slotIndex) => {
    const feedOrder = gridConfig.currentSlotIndex - slotIndex - historyOffset;
    const concept = concepts.find((item) => item.placement.feed_order === feedOrder) ?? null;
    const type = concept
      ? feedOrder === 0
        ? 'current'
        : feedOrder < 0
          ? 'history'
          : 'planned'
      : 'empty';

    return {
      slotIndex,
      feedOrder,
      concept,
      type,
    };
  });
}

export function hasMoreHistory(
  concepts: CustomerConcept[],
  gridConfig: GridConfig,
  historyOffset = 0
): boolean {
  const earliestFeedOrder = concepts
    .map((concept) => concept.placement.feed_order)
    .filter((value): value is number => typeof value === 'number')
    .reduce((min, value) => Math.min(min, value), 0);

  // In canonical orientation, slot 8 (bottom-right) has the most negative feedOrder.
  const visibleEnd = -gridConfig.currentSlotIndex - historyOffset;
  return earliestFeedOrder < visibleEnd;
}

/**
 * Converts a global span frac back to a projected posting date.
 * Steps forward (future) or backward (history) through the weekday cadence from anchor.
 * Returns null only when no rhythm is set (weekdays empty).
 */
export function globalFracToProjectedDate(
  globalFrac: number,
  anchor: Date,
  weekdays: number[],
  gridConfig: GridConfig
): Date | null {
  const totalSlots = gridConfig.columns * gridConfig.rows;
  if (totalSlots === 0) return null;
  const feedOrder = Math.round(gridConfig.currentSlotIndex - globalFrac * totalSlots);

  if (feedOrder > 0) {
    if (weekdays.length === 0) return null;
    return projectTempoDate(feedOrder, anchor, weekdays);
  }

  if (feedOrder === 0) return new Date(anchor);

  // Historical: step backwards through weekday cadence
  if (weekdays.length === 0) return null;
  const sorted = [...weekdays].sort((a, b) => a - b);
  const d = new Date(anchor);
  let count = 0;
  const target = -feedOrder;
  while (count < target) {
    d.setDate(d.getDate() - 1);
    const normalised = (d.getDay() + 6) % 7;
    if (sorted.includes(normalised)) count++;
  }
  return d;
}

/** Alias: same as climaxDateToGlobalFrac — use for any span date → frac conversion. */
export { climaxDateToGlobalFrac as dateToGlobalFrac };

/** Default posting weekdays for soft tempo projection: Tuesday (1) and Friday (4). 0=Mon … 6=Sun. */
export const DEFAULT_TEMPO_WEEKDAYS: number[] = [1, 4];

export interface TempoPreset {
  key: string;
  label: string;  // Short Swedish label for the preset picker
  weekdays: number[];
}

/** Available tempo presets for the CM feed planner. Sorted ascending within each weekdays array. */
export const TEMPO_PRESETS: TempoPreset[] = [
  { key: 'tue_fri',     label: 'Tis · Fre',       weekdays: [1, 4] },
  { key: 'mon_wed_fri', label: 'Mån · Ons · Fre',  weekdays: [0, 2, 4] },
  { key: 'wed_sat',     label: 'Ons · Lör',        weekdays: [2, 5] },
  { key: 'daily',       label: 'Daglig',            weekdays: [0, 1, 2, 3, 4, 5, 6] },
  { key: 'none',        label: 'Ingen rytm',        weekdays: [] },
];

/**
 * Projects a posting date for a given feed_order by stepping forward from an anchor
 * date through a weekly weekday cadence. Display-only — never written to the database.
 *
 * Returns null for feed_order ≤ 0 (current or history slot).
 *
 * @param feedOrder - Slot feed_order (must be > 0 to get a result)
 * @param anchor    - Date anchor, typically published_at of the feed_order=0 concept
 * @param weekdays  - Weekday indices (0=Mon … 6=Sun), defaults to Tue + Fri
 */
/**
 * Converts a climax date to a global span frac so the climax dot can be placed
 * on the eel SVG. The result may exceed [0, 1] if the date is outside the current
 * grid window — the caller is responsible for clamping or allowing the overflow.
 *
 * Returns null if weekdays is empty (no rhythm → no projection).
 */
export function climaxDateToGlobalFrac(
  climaxDate: Date,
  anchor: Date,
  weekdays: number[],
  gridConfig: GridConfig
): number | null {
  const totalSlots = gridConfig.columns * gridConfig.rows;
  if (totalSlots === 0) return null;

  const targetMs = climaxDate.getTime();
  const anchorMs = anchor.getTime();
  const daysDiff = (targetMs - anchorMs) / (1000 * 60 * 60 * 24);

  // Estimate which feed_order the climax date falls near
  const avgPostsPerDay = weekdays.length > 0 ? weekdays.length / 7 : 2 / 7;
  const estimatedFeedOrder = Math.round(daysDiff * avgPostsPerDay);

  if (weekdays.length > 0 && estimatedFeedOrder > 0) {
    // Scan projected dates around the estimate to find the closest
    const scanMin = Math.max(1, estimatedFeedOrder - 8);
    const scanMax = estimatedFeedOrder + 8;
    let bestFo = estimatedFeedOrder;
    let bestDiff = Infinity;
    for (let fo = scanMin; fo <= scanMax; fo++) {
      const projected = projectTempoDate(fo, anchor, weekdays);
      if (!projected) continue;
      const diff = Math.abs(projected.getTime() - targetMs);
      if (diff < bestDiff) { bestDiff = diff; bestFo = fo; }
    }
    return (gridConfig.currentSlotIndex - bestFo) / totalSlots;
  }

  // Fallback: use estimated feed_order directly (no weekday cadence or past date)
  return (gridConfig.currentSlotIndex - estimatedFeedOrder) / totalSlots;
}
export function projectTempoDate(
  feedOrder: number,
  anchor: Date,
  weekdays: number[] = DEFAULT_TEMPO_WEEKDAYS
): Date | null {
  if (feedOrder <= 0 || weekdays.length === 0) return null;

  const sorted = [...weekdays].sort((a, b) => a - b);
  const d = new Date(anchor);
  let count = 0;

  while (count < feedOrder) {
    d.setDate(d.getDate() + 1);
    // Convert JS getDay() (0=Sun, 1=Mon … 6=Sat) → 0=Mon … 6=Sun
    const normalised = (d.getDay() + 6) % 7;
    if (sorted.includes(normalised)) count++;
  }

  return d;
}
