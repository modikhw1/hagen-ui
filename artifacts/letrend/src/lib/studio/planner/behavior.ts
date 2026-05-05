import type {
  PlannerCardAction,
  PlannerCardBadge,
  PlannerTimelineNode,
} from './types';

export interface PlannerBehaviorContext {
  futureCount: number;
}

function pushIf<T>(items: T[], condition: boolean, value: T): void {
  if (condition) items.push(value);
}

export function buildPlannerCardActions(
  node: PlannerTimelineNode,
  context: PlannerBehaviorContext
): PlannerCardAction[] {
  if (node.state === 'past') {
    const actions: PlannerCardAction[] = [];
    pushIf(actions, Boolean(node.concept.result.tiktok_url), 'open_tiktok');
    actions.push('edit_note');

    if (node.concept.row_kind === 'imported_history') {
      if (node.reconciliationState === 'unlinked_history') {
        actions.push('edit_tiktok_url', 'reconcile_to_now', 'reconcile_to_concept');
      }
      pushIf(actions, node.reconciliationState === 'linked_history', 'undo_reconciliation');
      return actions;
    }

    pushIf(
      actions,
      node.reconciliationState === 'linked_concept' ||
        node.reconciliationState === 'linked_collaboration',
      'undo_reconciliation'
    );
    pushIf(
      actions,
      Boolean(node.concept.reconciliation.linked_customer_concept_id),
      'open_reconciled_concept'
    );
    pushIf(
      actions,
      node.reconciliationState === 'unlinked_history',
      'link_tiktok_clip'
    );
    pushIf(actions, node.reconciliationState === 'unlinked_history', 'edit_tiktok_url');
    return actions;
  }

  const actions: PlannerCardAction[] = [
    'open_details',
    'edit_planned_date',
    'manage_tags',
    'edit_note',
    'remove_from_queue',
  ];

  if (node.state === 'now') {
    return ['mark_produced', ...actions];
  }

  pushIf(actions, (node.queueOrder ?? 0) > 0, 'move_up');
  pushIf(actions, (node.queueOrder ?? 0) < context.futureCount - 1, 'move_down');
  return actions;
}

export function buildPlannerCardBadges(node: PlannerTimelineNode): PlannerCardBadge[] {
  const badges: PlannerCardBadge[] = [];

  pushIf(badges, node.state === 'now', 'now');
  pushIf(badges, node.state === 'past', 'verified_history');
  pushIf(badges, Boolean(node.anchor), 'soft_anchor');
  pushIf(badges, node.historyIdentity === 'tiktok_standalone', 'tiktok_standalone');
  pushIf(badges, node.historyIdentity === 'letrend_linked', 'letrend_linked');

  if (node.cardKind === 'collaboration') {
    badges.push(node.concept.confirmed ? 'confirmed' : 'unconfirmed');
  }

  pushIf(badges, node.concept.reconciliation.is_reconciled, 'reconciled');
  pushIf(
    badges,
    Boolean(node.concept.reconciliation.reconciled_clip_id),
    'linked_history'
  );

  return badges;
}
