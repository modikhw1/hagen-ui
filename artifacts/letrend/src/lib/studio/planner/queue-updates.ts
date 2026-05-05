import type { CustomerConcept } from '@/types/studio-v2';

export interface PlannerQueueFeedOrderUpdate {
  conceptId: string;
  feedOrder: number;
}

function readFeedOrder(concept: CustomerConcept): number | null {
  return concept.placement?.feed_order ?? concept.feed_order ?? null;
}

function isFutureQueueConcept(concept: CustomerConcept): boolean {
  const feedOrder = readFeedOrder(concept);
  return concept.row_kind === 'assignment' && typeof feedOrder === 'number' && feedOrder >= 0;
}

function sortFutureQueue(a: CustomerConcept, b: CustomerConcept): number {
  const feedOrderA = readFeedOrder(a) ?? Number.MAX_SAFE_INTEGER;
  const feedOrderB = readFeedOrder(b) ?? Number.MAX_SAFE_INTEGER;
  if (feedOrderA !== feedOrderB) return feedOrderA - feedOrderB;
  const addedAtOrder = a.added_at.localeCompare(b.added_at);
  if (addedAtOrder !== 0) return addedAtOrder;
  return a.id.localeCompare(b.id);
}

function toChangedDenseUpdates(queue: CustomerConcept[]): PlannerQueueFeedOrderUpdate[] {
  return queue.flatMap((concept, index) => {
    const currentFeedOrder = readFeedOrder(concept);
    return currentFeedOrder === index
      ? []
      : [{ conceptId: concept.id, feedOrder: index }];
  });
}

export function buildDenseFeedOrderInsertionUpdates(
  concepts: CustomerConcept[],
  conceptId: string,
  targetFeedOrder: number
): PlannerQueueFeedOrderUpdate[] {
  const concept = concepts.find((item) => item.id === conceptId);
  if (!concept || concept.row_kind !== 'assignment') return [];

  const queueWithoutConcept = concepts
    .filter((item) => isFutureQueueConcept(item) && item.id !== conceptId)
    .sort(sortFutureQueue);
  const insertIndex = Math.max(0, Math.min(Math.floor(targetFeedOrder), queueWithoutConcept.length));
  const nextQueue = [
    ...queueWithoutConcept.slice(0, insertIndex),
    concept,
    ...queueWithoutConcept.slice(insertIndex),
  ];

  return toChangedDenseUpdates(nextQueue);
}

export function buildDenseFeedOrderSwapUpdates(
  concepts: CustomerConcept[],
  conceptIdA: string,
  conceptIdB: string
): PlannerQueueFeedOrderUpdate[] {
  const queue = concepts.filter(isFutureQueueConcept).sort(sortFutureQueue);
  const indexA = queue.findIndex((concept) => concept.id === conceptIdA);
  const indexB = queue.findIndex((concept) => concept.id === conceptIdB);
  if (indexA < 0 || indexB < 0 || indexA === indexB) return [];

  const nextQueue = [...queue];
  [nextQueue[indexA], nextQueue[indexB]] = [nextQueue[indexB], nextQueue[indexA]];
  return toChangedDenseUpdates(nextQueue);
}
