import type { CustomerConcept } from '@/types/studio-v2';

export type PlannerCardKind = 'history' | 'concept' | 'collaboration';
export type PlannerCardState = 'past' | 'now' | 'upcoming';
export type PlannerNodeZone = 'past' | 'future';
export type PlannerVisualCellKind = 'card' | 'current_placeholder' | 'insert_invite' | 'let_pad';
export type PlannerHistoryIdentity = 'tiktok_standalone' | 'letrend_linked' | 'none';
export type PlannerReconciliationState =
  | 'not_applicable'
  | 'unlinked_history'
  | 'linked_history'
  | 'linked_concept'
  | 'linked_collaboration';
export type PlannerCardAction =
  | 'open_details'
  | 'mark_produced'
  | 'edit_planned_date'
  | 'manage_tags'
  | 'edit_note'
  | 'remove_from_queue'
  | 'move_up'
  | 'move_down'
  | 'open_tiktok'
  | 'edit_tiktok_url'
  | 'reconcile_to_now'
  | 'reconcile_to_concept'
  | 'undo_reconciliation'
  | 'link_tiktok_clip'
  | 'open_reconciled_concept';
export type PlannerCardBadge =
  | 'now'
  | 'confirmed'
  | 'unconfirmed'
  | 'soft_anchor'
  | 'verified_history'
  | 'reconciled'
  | 'linked_history'
  | 'tiktok_standalone'
  | 'letrend_linked';
export type PlannerReason =
  | 'verified_history'
  | 'planned_queue'
  | 'current_placeholder'
  | 'soft_anchor';

export interface PlannerInput {
  concepts: CustomerConcept[];
  tempoWeekdays?: number[];
  now?: Date;
}

export interface PlannerAnchorConstraint {
  mode: 'soft';
  targetDate: string;
  source: 'planned_publish_at';
}

export interface PlannerBaseEntry {
  id: string;
  concept: CustomerConcept;
  cardKind: PlannerCardKind;
  originalFeedOrder: number | null;
  confirmedDate: string | null;
  anchor: PlannerAnchorConstraint | null;
}

export interface PlannerHistoryEntry extends PlannerBaseEntry {
  zone: 'past';
  occurredAt: string | null;
}

export interface PlannerPlannedEntry extends PlannerBaseEntry {
  zone: 'future';
  queueOrder: number;
}

export type PlannerNormalizedEntry = PlannerHistoryEntry | PlannerPlannedEntry;

export interface PlannerTimelineNode {
  id: string;
  concept: CustomerConcept;
  cardKind: PlannerCardKind;
  state: PlannerCardState;
  zone: PlannerNodeZone;
  relativePosition: number;
  queueOrder: number | null;
  originalFeedOrder: number | null;
  occurredAt: string | null;
  confirmedDate: string | null;
  anchor: PlannerAnchorConstraint | null;
  historyIdentity: PlannerHistoryIdentity;
  reconciliationState: PlannerReconciliationState;
}

export interface FeedPlannerCardModel {
  id: string;
  concept: CustomerConcept;
  kind: PlannerCardKind;
  state: PlannerCardState;
  relativePosition: number;
  queueOrder: number | null;
  originalFeedOrder: number | null;
  positionLabel: string;
  occurredAt: string | null;
  projectedDate: string | null;
  confirmedDate: string | null;
  anchor: PlannerAnchorConstraint | null;
  reason: PlannerReason;
  historyIdentity: PlannerHistoryIdentity;
  reconciliationState: PlannerReconciliationState;
  actions: PlannerCardAction[];
  badges: PlannerCardBadge[];
}

export interface FeedPlannerCurrentPlaceholder {
  state: 'now';
  positionLabel: 'Nu';
  projectedDate: string | null;
  reason: 'current_placeholder';
}

export interface PlannerVisualCell {
  kind: PlannerVisualCellKind;
  cellIndex: number;
  rowIndex: number;
  columnIndex: number;
  relativePosition: number;
  projectedDate: string | null;
  card: FeedPlannerCardModel | null;
  placeholder: FeedPlannerCurrentPlaceholder | null;
}

export interface FeedPlannerGridProjection {
  columns: number;
  currentCellIndex: number;
  cells: PlannerVisualCell[];
  rows: PlannerVisualCell[][];
}

export interface FeedPlannerViewModel {
  boundaryIndex: number;
  cards: FeedPlannerCardModel[];
  pastCards: FeedPlannerCardModel[];
  currentCard: FeedPlannerCardModel | null;
  upcomingCards: FeedPlannerCardModel[];
  currentPlaceholder: FeedPlannerCurrentPlaceholder | null;
  grid: FeedPlannerGridProjection;
  hasPast: boolean;
  hasPlanned: boolean;
}
