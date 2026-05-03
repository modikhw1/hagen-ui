import type { CustomerConcept, FeedSlot, GridConfig } from '@/types/studio-v2';

function getTotalSlots(gridConfig: GridConfig): number {
  return gridConfig.columns * gridConfig.rows;
}

function getMeaningfulFloor(concepts: CustomerConcept[]): number {
  const feedOrders = concepts
    .map((concept) => concept.placement.feed_order)
    .filter((value): value is number => typeof value === 'number');

  return feedOrders.length > 0 ? Math.min(...feedOrders, 0) : 0;
}

export function fracToFeedOrder(
  frac: number,
  historyOffset: number,
  gridConfig: GridConfig
): number {
  const totalSlots = getTotalSlots(gridConfig);
  if (totalSlots === 0) return 0;
  return Math.round(gridConfig.currentSlotIndex - historyOffset - frac * totalSlots);
}

export function feedOrderToFrac(
  feedOrder: number,
  historyOffset: number,
  gridConfig: GridConfig
): number {
  const totalSlots = getTotalSlots(gridConfig);
  if (totalSlots === 0) return 0;
  return (gridConfig.currentSlotIndex - historyOffset - feedOrder) / totalSlots;
}

export function getMaxHistoryOffset(
  concepts: CustomerConcept[],
  gridConfig: GridConfig
): number {
  const totalSlots = getTotalSlots(gridConfig);
  if (totalSlots === 0) return 0;

  const lowestMeaningful = getMeaningfulFloor(concepts);
  return Math.max(0, gridConfig.currentSlotIndex - (totalSlots - 1) - lowestMeaningful);
}

export function buildSlotMap(
  concepts: CustomerConcept[],
  gridConfig: GridConfig,
  historyOffset = 0
): FeedSlot[] {
  const totalSlots = getTotalSlots(gridConfig);
  const lowestMeaningful = getMeaningfulFloor(concepts);
  const conceptByFeedOrder = new Map(
    concepts
      .map((concept) => [concept.placement.feed_order, concept] as const)
      .filter((entry): entry is [number, CustomerConcept] => typeof entry[0] === 'number')
  );
  const slots: Array<FeedSlot | null> = Array.from({ length: totalSlots }, (_, slotIndex) => {
    const feedOrder = gridConfig.currentSlotIndex - slotIndex - historyOffset;
    const concept = conceptByFeedOrder.get(feedOrder) ?? null;

    if (concept) {
      return {
        slotIndex,
        feedOrder,
        concept,
        type:
          feedOrder === 0
            ? 'current'
            : feedOrder < 0
              ? 'history'
              : 'planned',
      };
    }

    if (feedOrder < lowestMeaningful) {
      return null;
    }

    return {
      slotIndex,
      feedOrder,
      concept: null,
      type: 'empty',
    };
  });

  let lastVisibleSlotIndex = -1;
  for (let slotIndex = slots.length - 1; slotIndex >= 0; slotIndex -= 1) {
    if (slots[slotIndex] !== null) {
      lastVisibleSlotIndex = slotIndex;
      break;
    }
  }

  if (lastVisibleSlotIndex === -1) return [];

  const lastVisibleRowEnd = Math.min(
    totalSlots - 1,
    Math.floor(lastVisibleSlotIndex / gridConfig.columns) * gridConfig.columns +
      gridConfig.columns -
      1
  );

  return Array.from({ length: lastVisibleRowEnd + 1 }, (_, slotIndex) => {
    const slot = slots[slotIndex];
    if (slot) return slot;

    return {
      slotIndex,
      feedOrder: gridConfig.currentSlotIndex - slotIndex - historyOffset,
      concept: null,
      type: 'brand_pad',
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

  const visibleEnd = -gridConfig.currentSlotIndex - historyOffset;
  return earliestFeedOrder < visibleEnd;
}

export function globalFracToProjectedDate(
  globalFrac: number,
  anchor: Date,
  weekdays: number[],
  gridConfig: GridConfig
): Date | null {
  const totalSlots = getTotalSlots(gridConfig);
  if (totalSlots === 0) return null;
  const feedOrder = Math.round(gridConfig.currentSlotIndex - globalFrac * totalSlots);

  if (feedOrder > 0) {
    if (weekdays.length === 0) return null;
    return projectTempoDate(feedOrder, anchor, weekdays);
  }

  if (feedOrder === 0) return new Date(anchor);

  if (weekdays.length === 0) return null;
  const sorted = [...weekdays].sort((a, b) => a - b);
  const date = new Date(anchor);
  let count = 0;
  const target = -feedOrder;
  while (count < target) {
    date.setDate(date.getDate() - 1);
    const normalised = (date.getDay() + 6) % 7;
    if (sorted.includes(normalised)) count++;
  }
  return date;
}

export { climaxDateToGlobalFrac as dateToGlobalFrac };

export const DEFAULT_TEMPO_WEEKDAYS: number[] = [1, 4];

export interface TempoPreset {
  key: string;
  label: string;
  weekdays: number[];
}

export const TEMPO_PRESETS: TempoPreset[] = [
  { key: 'tue_fri', label: 'Tis · Fre', weekdays: [1, 4] },
  { key: 'mon_wed_fri', label: 'Mån · Ons · Fre', weekdays: [0, 2, 4] },
  { key: 'wed_sat', label: 'Ons · Lör', weekdays: [2, 5] },
  { key: 'daily', label: 'Daglig', weekdays: [0, 1, 2, 3, 4, 5, 6] },
  { key: 'none', label: 'Ingen rytm', weekdays: [] },
];

export function climaxDateToGlobalFrac(
  climaxDate: Date,
  anchor: Date,
  weekdays: number[],
  gridConfig: GridConfig
): number | null {
  const totalSlots = getTotalSlots(gridConfig);
  if (totalSlots === 0) return null;

  const targetMs = climaxDate.getTime();
  const anchorMs = anchor.getTime();
  const daysDiff = (targetMs - anchorMs) / (1000 * 60 * 60 * 24);

  const avgPostsPerDay = weekdays.length > 0 ? weekdays.length / 7 : 2 / 7;
  const estimatedFeedOrder = Math.round(daysDiff * avgPostsPerDay);

  if (weekdays.length > 0 && estimatedFeedOrder > 0) {
    const scanMin = Math.max(1, estimatedFeedOrder - 8);
    const scanMax = estimatedFeedOrder + 8;
    let bestFo = estimatedFeedOrder;
    let bestDiff = Infinity;
    for (let feedOrder = scanMin; feedOrder <= scanMax; feedOrder++) {
      const projected = projectTempoDate(feedOrder, anchor, weekdays);
      if (!projected) continue;
      const diff = Math.abs(projected.getTime() - targetMs);
      if (diff < bestDiff) {
        bestDiff = diff;
        bestFo = feedOrder;
      }
    }
    return (gridConfig.currentSlotIndex - bestFo) / totalSlots;
  }

  return (gridConfig.currentSlotIndex - estimatedFeedOrder) / totalSlots;
}

export function projectTempoDate(
  feedOrder: number,
  anchor: Date,
  weekdays: number[] = DEFAULT_TEMPO_WEEKDAYS
): Date | null {
  if (feedOrder <= 0 || weekdays.length === 0) return null;

  const sorted = [...weekdays].sort((a, b) => a - b);
  const date = new Date(anchor);
  let count = 0;

  while (count < feedOrder) {
    date.setDate(date.getDate() + 1);
    const normalised = (date.getDay() + 6) % 7;
    if (sorted.includes(normalised)) count++;
  }

  return date;
}
