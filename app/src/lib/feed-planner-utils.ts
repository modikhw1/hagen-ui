import type { CustomerConcept, FeedSlot, GridConfig } from '@/types/studio-v2';

export function buildSlotMap(
  concepts: CustomerConcept[],
  gridConfig: GridConfig,
  historyOffset = 0
): FeedSlot[] {
  const totalSlots = gridConfig.columns * gridConfig.rows;
  const startFeedOrder = -gridConfig.currentSlotIndex - historyOffset;

  return Array.from({ length: totalSlots }, (_, slotIndex) => {
    const feedOrder = startFeedOrder + slotIndex;
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

  const visibleStart = -gridConfig.currentSlotIndex - historyOffset;
  return earliestFeedOrder < visibleStart;
}
