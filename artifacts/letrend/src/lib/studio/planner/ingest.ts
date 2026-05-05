import { isCollaborationCustomerConcept } from '@/lib/studio/customer-concepts';
import type { CustomerConcept } from '@/types/studio-v2';
import type {
  PlannerAnchorConstraint,
  PlannerCardKind,
  PlannerHistoryEntry,
  PlannerInput,
  PlannerNormalizedEntry,
  PlannerPlannedEntry,
} from './types';

function readCardKind(concept: CustomerConcept): PlannerCardKind {
  if (concept.row_kind === 'imported_history') return 'history';
  return isCollaborationCustomerConcept(concept) ? 'collaboration' : 'concept';
}

function readConfirmedDate(concept: CustomerConcept): string | null {
  return concept.result.planned_publish_at ?? concept.planned_publish_at ?? null;
}

function readAnchor(concept: CustomerConcept): PlannerAnchorConstraint | null {
  const targetDate = readConfirmedDate(concept);
  if (!targetDate) return null;

  return {
    mode: 'soft',
    targetDate,
    source: 'planned_publish_at',
  };
}

function isVerifiedHistory(concept: CustomerConcept): boolean {
  if (concept.row_kind === 'imported_history') return true;
  return typeof concept.placement.feed_order === 'number' && concept.placement.feed_order < 0;
}

function readOccurredAt(concept: CustomerConcept): string | null {
  return (
    concept.result.published_at ??
    concept.published_at ??
    concept.origin.last_observed_at ??
    concept.origin.first_observed_at ??
    null
  );
}

function compareNullableNumbers(a: number | null, b: number | null): number {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return a - b;
}

function compareNullableDates(a: string | null, b: string | null): number {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return a.localeCompare(b);
}

function compareHistory(a: PlannerHistoryEntry, b: PlannerHistoryEntry): number {
  return (
    compareNullableDates(a.occurredAt, b.occurredAt) ||
    compareNullableNumbers(a.originalFeedOrder, b.originalFeedOrder) ||
    a.id.localeCompare(b.id)
  );
}

function comparePlanned(a: PlannerPlannedEntry, b: PlannerPlannedEntry): number {
  return (
    compareNullableNumbers(a.originalFeedOrder, b.originalFeedOrder) ||
    compareNullableDates(a.confirmedDate, b.confirmedDate) ||
    a.id.localeCompare(b.id)
  );
}

export function normalizePlannerInput(input: PlannerInput): PlannerNormalizedEntry[] {
  const historyEntries: PlannerHistoryEntry[] = [];
  const plannedEntries: PlannerPlannedEntry[] = [];

  for (const concept of input.concepts) {
    if (concept.assignment.status === 'archived') continue;

    const base = {
      id: concept.id,
      concept,
      cardKind: readCardKind(concept),
      originalFeedOrder: concept.placement.feed_order,
      confirmedDate: readConfirmedDate(concept),
      anchor: readAnchor(concept),
    } as const;

    if (isVerifiedHistory(concept)) {
      historyEntries.push({
        ...base,
        zone: 'past',
        occurredAt: readOccurredAt(concept),
      });
      continue;
    }

    if (concept.row_kind !== 'assignment') continue;
    if (concept.placement.feed_order === null) continue;

    plannedEntries.push({
      ...base,
      zone: 'future',
      queueOrder: 0,
    });
  }

  historyEntries.sort(compareHistory);
  plannedEntries.sort(comparePlanned);

  return [
    ...historyEntries,
    ...plannedEntries.map((entry, index) => ({
      ...entry,
      queueOrder: index,
    })),
  ];
}
