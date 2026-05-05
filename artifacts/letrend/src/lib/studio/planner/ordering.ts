import type {
  PlannerHistoryEntry,
  PlannerHistoryIdentity,
  PlannerNormalizedEntry,
  PlannerPlannedEntry,
  PlannerReconciliationState,
  PlannerTimelineNode,
} from './types';

export interface PlannerOrderingResult {
  boundaryIndex: number;
  past: PlannerHistoryEntry[];
  future: PlannerPlannedEntry[];
  timeline: PlannerTimelineNode[];
}

function readHistoryIdentity(entry: PlannerHistoryEntry): PlannerHistoryIdentity {
  if (entry.concept.row_kind === 'imported_history') {
    return entry.concept.reconciliation.is_reconciled
      ? 'letrend_linked'
      : 'tiktok_standalone';
  }

  return entry.concept.reconciliation.reconciled_clip_id
    ? 'letrend_linked'
    : 'tiktok_standalone';
}

function readReconciliationState(entry: PlannerHistoryEntry): PlannerReconciliationState {
  if (entry.concept.row_kind === 'imported_history') {
    return entry.concept.reconciliation.is_reconciled
      ? 'linked_history'
      : 'unlinked_history';
  }

  if (entry.concept.reconciliation.reconciled_clip_id) {
    return entry.cardKind === 'collaboration'
      ? 'linked_collaboration'
      : 'linked_concept';
  }

  return 'unlinked_history';
}

export function buildPlannerOrdering(entries: PlannerNormalizedEntry[]): PlannerOrderingResult {
  const past = entries.filter((entry): entry is PlannerHistoryEntry => entry.zone === 'past');
  const future = entries.filter((entry): entry is PlannerPlannedEntry => entry.zone === 'future');

  const pastNodes: PlannerTimelineNode[] = past.map((entry, index) => ({
    id: entry.id,
    concept: entry.concept,
    cardKind: entry.cardKind,
    state: 'past',
    zone: 'past',
    relativePosition: index - past.length,
    queueOrder: null,
    originalFeedOrder: entry.originalFeedOrder,
    occurredAt: entry.occurredAt,
    confirmedDate: entry.confirmedDate,
    anchor: entry.anchor,
    historyIdentity: readHistoryIdentity(entry),
    reconciliationState: readReconciliationState(entry),
  }));

  const futureNodes: PlannerTimelineNode[] = future.map((entry) => ({
    id: entry.id,
    concept: entry.concept,
    cardKind: entry.cardKind,
    state: entry.queueOrder === 0 ? 'now' : 'upcoming',
    zone: 'future',
    relativePosition: entry.queueOrder,
    queueOrder: entry.queueOrder,
    originalFeedOrder: entry.originalFeedOrder,
    occurredAt: null,
    confirmedDate: entry.confirmedDate,
    anchor: entry.anchor,
    historyIdentity: 'none',
    reconciliationState: 'not_applicable',
  }));

  return {
    boundaryIndex: pastNodes.length,
    past,
    future,
    timeline: [...pastNodes, ...futureNodes],
  };
}
