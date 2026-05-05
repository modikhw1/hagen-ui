import type { PlannerTimelineNode, FeedPlannerCardModel, PlannerReason } from './types';
import {
  buildPlannerCardActions,
  buildPlannerCardBadges,
  type PlannerBehaviorContext,
} from './behavior';

function formatPositionLabel(relativePosition: number): string {
  if (relativePosition === 0) return 'Nu';
  if (relativePosition > 0) return `+${relativePosition}`;
  return String(relativePosition);
}

export function buildPlannerCardModel(
  node: PlannerTimelineNode,
  projectedDate: string | null,
  context: PlannerBehaviorContext
): FeedPlannerCardModel {
  const reason: PlannerReason =
    node.state === 'past'
      ? 'verified_history'
      : node.anchor
        ? 'soft_anchor'
        : 'planned_queue';

  return {
    id: node.id,
    concept: node.concept,
    kind: node.cardKind,
    state: node.state,
    relativePosition: node.relativePosition,
    queueOrder: node.queueOrder,
    originalFeedOrder: node.originalFeedOrder,
    positionLabel: formatPositionLabel(node.relativePosition),
    occurredAt: node.occurredAt,
    projectedDate,
    confirmedDate: node.confirmedDate,
    anchor: node.anchor,
    reason,
    historyIdentity: node.historyIdentity,
    reconciliationState: node.reconciliationState,
    actions: buildPlannerCardActions(node, context),
    badges: buildPlannerCardBadges(node),
  };
}
