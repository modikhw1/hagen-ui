import { describe, expect, it } from 'vitest';
import { buildFeedPlannerModel } from './build-feed-planner-model';
import {
  buildDenseFeedOrderInsertionUpdates,
  buildDenseFeedOrderSwapUpdates,
} from './queue-updates';
import { normalizeStudioCustomerConcept } from '../customer-concepts';

function rawRow(id: string, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id,
    customer_id: 'cust-1',
    customer_profile_id: 'cust-1',
    concept_id: `concept-${id}`,
    status: 'sent',
    feed_order: 0,
    added_at: '2026-04-10T00:00:00Z',
    updated_at: '2026-04-15T00:00:00Z',
    ...overrides,
  };
}

describe('buildFeedPlannerModel', () => {
  it('sets Nu to the first planned card and compacts future gaps into a dense queue', () => {
    const concepts = [
      normalizeStudioCustomerConcept(rawRow('future-3', { feed_order: 3 })),
      normalizeStudioCustomerConcept(rawRow('future-9', { feed_order: 9 })),
      normalizeStudioCustomerConcept(rawRow('future-1', { feed_order: 1 })),
    ];

    const model = buildFeedPlannerModel({
      concepts,
      now: new Date('2026-05-05T09:00:00Z'),
      tempoWeekdays: [1, 4],
    });

    expect(model.currentCard?.id).toBe('future-1');
    expect(model.currentCard?.positionLabel).toBe('Nu');
    expect(model.upcomingCards.map((card) => [card.id, card.positionLabel])).toEqual([
      ['future-3', '+1'],
      ['future-9', '+2'],
    ]);
  });

  it('places Nu directly after verified history and keeps history cards in the past zone', () => {
    const concepts = [
      normalizeStudioCustomerConcept(
        rawRow('history-old', {
          concept_id: null,
          feed_order: -2,
          published_at: '2026-05-01T10:00:00Z',
          history_source: 'tiktok_profile',
        })
      ),
      normalizeStudioCustomerConcept(
        rawRow('history-new', {
          concept_id: null,
          feed_order: -1,
          published_at: '2026-05-03T10:00:00Z',
          history_source: 'tiktok_profile',
        })
      ),
      normalizeStudioCustomerConcept(rawRow('next-up', { feed_order: 4 })),
    ];

    const model = buildFeedPlannerModel({
      concepts,
      now: new Date('2026-05-05T09:00:00Z'),
      tempoWeekdays: [1, 4],
    });

    expect(model.boundaryIndex).toBe(2);
    expect(model.pastCards.map((card) => [card.id, card.positionLabel, card.state])).toEqual([
      ['history-old', '-2', 'past'],
      ['history-new', '-1', 'past'],
    ]);
    expect(model.currentCard?.id).toBe('next-up');
    expect(model.currentCard?.state).toBe('now');
  });

  it('marks collaboration cards as anchored future cards without letting the anchor drive ordering', () => {
    const concepts = [
      normalizeStudioCustomerConcept(
        rawRow('concept-now', {
          feed_order: 0,
        })
      ),
      normalizeStudioCustomerConcept(
        rawRow('collab-later', {
          feed_order: 7,
          visual_variant: 'collaboration',
          planned_publish_at: '2026-05-20T00:00:00Z',
          confirmed: true,
        })
      ),
    ];

    const model = buildFeedPlannerModel({
      concepts,
      now: new Date('2026-05-05T09:00:00Z'),
      tempoWeekdays: [1, 4],
    });

    expect(model.currentCard?.id).toBe('concept-now');

    const collab = model.upcomingCards[0];
    expect(collab.id).toBe('collab-later');
    expect(collab.kind).toBe('collaboration');
    expect(collab.positionLabel).toBe('+1');
    expect(collab.confirmedDate).toBe('2026-05-20T00:00:00Z');
    expect(collab.anchor).toEqual({
      mode: 'soft',
      targetDate: '2026-05-20T00:00:00Z',
      source: 'planned_publish_at',
    });
    expect(collab.reason).toBe('soft_anchor');
    expect(collab.badges).toEqual(['soft_anchor', 'confirmed']);
  });

  it('returns a current placeholder when only verified history exists', () => {
    const concepts = [
      normalizeStudioCustomerConcept(
        rawRow('history-only', {
          concept_id: null,
          feed_order: -1,
          published_at: '2026-05-03T10:00:00Z',
          history_source: 'tiktok_profile',
        })
      ),
    ];

    const model = buildFeedPlannerModel({
      concepts,
      now: new Date('2026-05-05T09:00:00Z'),
      tempoWeekdays: [1, 4],
    });

    expect(model.currentCard).toBeNull();
    expect(model.currentPlaceholder).toEqual({
      state: 'now',
      positionLabel: 'Nu',
      projectedDate: '2026-05-05T09:00:00.000Z',
      reason: 'current_placeholder',
    });
    expect(model.grid.cells[4]).toMatchObject({
      kind: 'current_placeholder',
      relativePosition: 0,
    });
  });

  it('exposes behavior actions for now, upcoming, and history cards', () => {
    const concepts = [
      normalizeStudioCustomerConcept(
        rawRow('history', {
          concept_id: null,
          feed_order: -1,
          published_at: '2026-05-03T10:00:00Z',
          tiktok_url: 'https://www.tiktok.com/@demo/video/1',
          history_source: 'tiktok_profile',
        })
      ),
      normalizeStudioCustomerConcept(rawRow('now', { feed_order: 0 })),
      normalizeStudioCustomerConcept(rawRow('upcoming', { feed_order: 4 })),
    ];

    const model = buildFeedPlannerModel({
      concepts,
      now: new Date('2026-05-05T09:00:00Z'),
      tempoWeekdays: [1, 4],
    });

    expect(model.currentCard?.actions).toEqual([
      'mark_produced',
      'open_details',
      'edit_planned_date',
      'manage_tags',
      'edit_note',
      'remove_from_queue',
    ]);
    expect(model.upcomingCards[0].actions).toEqual([
      'open_details',
      'edit_planned_date',
      'manage_tags',
      'edit_note',
      'remove_from_queue',
      'move_up',
    ]);
    expect(model.pastCards[0].actions).toEqual([
      'open_tiktok',
      'edit_note',
      'edit_tiktok_url',
      'reconcile_to_now',
      'reconcile_to_concept',
    ]);
    expect(model.pastCards[0].badges).toEqual(['verified_history', 'tiktok_standalone']);
    expect(model.pastCards[0].historyIdentity).toBe('tiktok_standalone');
    expect(model.pastCards[0].reconciliationState).toBe('unlinked_history');
  });

  it('treats reconciled history as LeTrend-linked and hides normal link/edit actions', () => {
    const concepts = [
      normalizeStudioCustomerConcept(
        rawRow('linked-history', {
          concept_id: null,
          feed_order: -1,
          published_at: '2026-05-03T10:00:00Z',
          tiktok_url: 'https://www.tiktok.com/@demo/video/1',
          history_source: 'tiktok_profile',
          reconciled_customer_concept_id: 'planned-1',
        })
      ),
    ];

    const model = buildFeedPlannerModel({
      concepts,
      now: new Date('2026-05-05T09:00:00Z'),
      tempoWeekdays: [1, 4],
    });

    expect(model.pastCards[0].historyIdentity).toBe('letrend_linked');
    expect(model.pastCards[0].reconciliationState).toBe('linked_history');
    expect(model.pastCards[0].badges).toEqual([
      'verified_history',
      'letrend_linked',
      'reconciled',
    ]);
    expect(model.pastCards[0].actions).toEqual([
      'open_tiktok',
      'edit_note',
      'undo_reconciliation',
    ]);
  });

  it('projects an empty planner as insert invites before Nu and LeT pads after Nu', () => {
    const model = buildFeedPlannerModel({
      concepts: [],
      now: new Date('2026-05-05T09:00:00Z'),
      tempoWeekdays: [1, 4],
    });

    expect(model.grid.cells.map((cell) => cell.kind)).toEqual([
      'insert_invite',
      'insert_invite',
      'insert_invite',
      'insert_invite',
      'current_placeholder',
      'let_pad',
      'let_pad',
      'let_pad',
      'let_pad',
    ]);
    expect(model.grid.cells.map((cell) => cell.relativePosition)).toEqual([
      4,
      3,
      2,
      1,
      0,
      -1,
      -2,
      -3,
      -4,
    ]);
  });

  it('places one unlinked TikTok history card in cell 6 and pads the rest of the row', () => {
    const concepts = [
      normalizeStudioCustomerConcept(
        rawRow('history-only', {
          concept_id: null,
          feed_order: -1,
          published_at: '2026-05-03T10:00:00Z',
          history_source: 'tiktok_profile',
        })
      ),
    ];

    const model = buildFeedPlannerModel({
      concepts,
      now: new Date('2026-05-05T09:00:00Z'),
      tempoWeekdays: [1, 4],
    });

    expect(model.grid.cells[5]).toMatchObject({
      kind: 'card',
      relativePosition: -1,
    });
    expect(model.grid.cells[5].card?.id).toBe('history-only');
    expect(model.grid.cells[5].card?.historyIdentity).toBe('tiktok_standalone');
    expect(model.grid.cells.slice(6, 9).map((cell) => cell.kind)).toEqual([
      'let_pad',
      'let_pad',
      'let_pad',
    ]);
  });

  it('places upcoming cards before Nu and keeps Nu in visual cell 5', () => {
    const concepts = [
      normalizeStudioCustomerConcept(rawRow('now', { feed_order: 0 })),
      normalizeStudioCustomerConcept(rawRow('next-1', { feed_order: 1 })),
      normalizeStudioCustomerConcept(rawRow('next-2', { feed_order: 2 })),
    ];

    const model = buildFeedPlannerModel({
      concepts,
      now: new Date('2026-05-05T09:00:00Z'),
      tempoWeekdays: [1, 4],
    });

    expect(model.grid.cells[4].card?.id).toBe('now');
    expect(model.grid.cells[4].card?.state).toBe('now');
    expect(model.grid.cells[3].card?.id).toBe('next-1');
    expect(model.grid.cells[3].relativePosition).toBe(1);
    expect(model.grid.cells[2].card?.id).toBe('next-2');
    expect(model.grid.cells[2].relativePosition).toBe(2);
    expect(model.grid.cells[0].kind).toBe('insert_invite');
    expect(model.grid.cells[1].kind).toBe('insert_invite');
  });

  it('extends history rows after Nu and fills the final row with LeT pads', () => {
    const concepts = Array.from({ length: 10 }, (_, index) =>
      normalizeStudioCustomerConcept(
        rawRow(`history-${index + 1}`, {
          concept_id: null,
          feed_order: -(index + 1),
          published_at: `2026-05-${String(index + 1).padStart(2, '0')}T10:00:00Z`,
          history_source: 'tiktok_profile',
        })
      )
    );

    const model = buildFeedPlannerModel({
      concepts,
      now: new Date('2026-05-12T09:00:00Z'),
      tempoWeekdays: [1, 4],
    });

    expect(model.grid.cells.length).toBe(15);
    expect(model.grid.rows.every((row) => row.length === 3)).toBe(true);
    expect(model.grid.cells[5].card?.id).toBe('history-10');
    expect(model.grid.cells[14].card?.id).toBe('history-1');
    expect(model.grid.cells.filter((cell) => cell.kind === 'let_pad')).toHaveLength(0);
  });

  it('fills incomplete extended history rows with LeT pads', () => {
    const concepts = Array.from({ length: 11 }, (_, index) =>
      normalizeStudioCustomerConcept(
        rawRow(`history-${index + 1}`, {
          concept_id: null,
          feed_order: -(index + 1),
          published_at: `2026-05-${String(index + 1).padStart(2, '0')}T10:00:00Z`,
          history_source: 'tiktok_profile',
        })
      )
    );

    const model = buildFeedPlannerModel({
      concepts,
      now: new Date('2026-05-12T09:00:00Z'),
      tempoWeekdays: [1, 4],
    });

    expect(model.grid.cells.length).toBe(18);
    expect(model.grid.cells[5].card?.id).toBe('history-11');
    expect(model.grid.cells.slice(16, 18).map((cell) => cell.kind)).toEqual([
      'let_pad',
      'let_pad',
    ]);
  });
});

describe('planner queue updates', () => {
  it('inserts a concept into the future queue and pushes later cards forward', () => {
    const concepts = [
      normalizeStudioCustomerConcept(rawRow('now', { feed_order: 0 })),
      normalizeStudioCustomerConcept(rawRow('next', { feed_order: 1 })),
      normalizeStudioCustomerConcept(rawRow('unplaced', { feed_order: null })),
    ];

    expect(buildDenseFeedOrderInsertionUpdates(concepts, 'unplaced', 1)).toEqual([
      { conceptId: 'unplaced', feedOrder: 1 },
      { conceptId: 'next', feedOrder: 2 },
    ]);
  });

  it('clamps far future inserts to the next dense queue position', () => {
    const concepts = [
      normalizeStudioCustomerConcept(rawRow('now', { feed_order: 0 })),
      normalizeStudioCustomerConcept(rawRow('unplaced', { feed_order: null })),
    ];

    expect(buildDenseFeedOrderInsertionUpdates(concepts, 'unplaced', 4)).toEqual([
      { conceptId: 'unplaced', feedOrder: 1 },
    ]);
  });

  it('swaps two queue cards and returns only changed feed orders', () => {
    const concepts = [
      normalizeStudioCustomerConcept(rawRow('now', { feed_order: 0 })),
      normalizeStudioCustomerConcept(rawRow('next', { feed_order: 1 })),
      normalizeStudioCustomerConcept(rawRow('later', { feed_order: 2 })),
    ];

    expect(buildDenseFeedOrderSwapUpdates(concepts, 'next', 'later')).toEqual([
      { conceptId: 'later', feedOrder: 1 },
      { conceptId: 'next', feedOrder: 2 },
    ]);
  });
});
