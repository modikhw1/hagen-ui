import { describe, expect, it } from 'vitest';
import { buildSlotMap } from './feed-planner-utils';
import { normalizeStudioCustomerConcept } from './studio/customer-concepts';
import { DEFAULT_GRID_CONFIG } from '@/types/studio-v2';

function placedRow(id: string, feedOrder: number, status = 'sent'): Record<string, unknown> {
  return {
    id,
    customer_id: 'cust-1',
    customer_profile_id: 'cust-1',
    concept_id: `concept-${id}`,
    status,
    feed_order: feedOrder,
    added_at: '2026-04-10T00:00:00Z',
    updated_at: '2026-04-15T00:00:00Z',
  };
}

describe('buildSlotMap', () => {
  it('places normalized concepts into history / current / planned slots in the 3×3 grid', () => {
    const concepts = [
      normalizeStudioCustomerConcept(placedRow('past', -1)),
      normalizeStudioCustomerConcept(placedRow('now', 0)),
      normalizeStudioCustomerConcept(placedRow('future', 2)),
    ];

    const slots = buildSlotMap(concepts, DEFAULT_GRID_CONFIG, 0);

    const byFeedOrder = new Map(slots.map((slot) => [slot.feedOrder, slot]));
    expect(byFeedOrder.get(0)?.concept?.id).toBe('now');
    expect(byFeedOrder.get(0)?.type).toBe('current');
    expect(byFeedOrder.get(-1)?.concept?.id).toBe('past');
    expect(byFeedOrder.get(-1)?.type).toBe('history');
    expect(byFeedOrder.get(2)?.concept?.id).toBe('future');
    expect(byFeedOrder.get(2)?.type).toBe('planned');
  });

  it('renders the full 3×3 grid when even one historical concept is placed (Task #44 regression)', () => {
    // The Task #44 bug: raw DB rows arrived without `placement`, so
    // `concept.placement.feed_order` threw or evaluated to undefined,
    // and the planner rendered no slots / mis-typed every slot.
    // After normalization, a single placed history concept must expand
    // the grid to all 9 slots and correctly classify them.
    const concepts = [
      normalizeStudioCustomerConcept(placedRow('past', -4)),
      normalizeStudioCustomerConcept(placedRow('now', 0)),
      normalizeStudioCustomerConcept(placedRow('future', 3)),
    ];

    const slots = buildSlotMap(concepts, DEFAULT_GRID_CONFIG, 0);
    const totalSlots = DEFAULT_GRID_CONFIG.columns * DEFAULT_GRID_CONFIG.rows;

    expect(slots.length).toBe(totalSlots);

    const types = slots.map((slot) => slot.type);
    expect(types).toContain('current');
    expect(types).toContain('history');
    expect(types).toContain('planned');

    // Every slot's feedOrder must equal currentSlotIndex - slotIndex so
    // the grid lines up with the calendar. A regression here would
    // scramble history vs planned positioning.
    for (let i = 0; i < slots.length; i += 1) {
      expect(slots[i].slotIndex).toBe(i);
      expect(slots[i].feedOrder).toBe(DEFAULT_GRID_CONFIG.currentSlotIndex - i);
    }
  });

  it('returns no slots when concepts have no placement (matches calendar trim semantics)', () => {
    // With no placed concepts, lowestMeaningful = 0, so the grid trims
    // history rows away. The planner is allowed to be empty in this
    // case — but the call must NOT throw, which is what the Task #44
    // bug effectively did via undefined `placement`.
    const concepts = [
      normalizeStudioCustomerConcept(placedRow('a', null as unknown as number)),
      normalizeStudioCustomerConcept(placedRow('b', null as unknown as number)),
    ];

    expect(() => buildSlotMap(concepts, DEFAULT_GRID_CONFIG, 0)).not.toThrow();
    const slots = buildSlotMap(concepts, DEFAULT_GRID_CONFIG, 0);
    expect(Array.isArray(slots)).toBe(true);
    expect(slots.every((slot) => slot.concept === null)).toBe(true);
    expect(slots.every((slot) => slot.type === 'empty' || slot.type === 'brand_pad')).toBe(true);
  });
});
