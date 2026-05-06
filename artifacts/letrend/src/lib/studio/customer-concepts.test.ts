import { describe, expect, it } from 'vitest';
import { normalizeStudioCustomerConcept } from './customer-concepts';

function rawRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'cc-1',
    customer_id: 'cust-1',
    customer_profile_id: 'cust-1',
    concept_id: 'concept-1',
    status: 'sent',
    cm_id: 'cm-1',
    feed_order: 0,
    added_at: '2026-04-10T00:00:00Z',
    updated_at: '2026-04-15T00:00:00Z',
    sent_at: '2026-04-12T00:00:00Z',
    tiktok_views: 1234,
    tags: ['hook', 'voiceover'],
    ...overrides,
  };
}

describe('normalizeStudioCustomerConcept', () => {
  it('lifts flat DB columns into the nested boundary shape required by FeedPlannerSection', () => {
    const concept = normalizeStudioCustomerConcept(rawRow());

    expect(concept.placement).toEqual({
      feed_order: 0,
      bucket: expect.any(String),
    });
    expect(concept.assignment.status).toBe('sent');
    expect(concept.assignment.has_source_concept).toBe(true);
    expect(concept.assignment.source_concept_id).toBe('concept-1');
    expect(concept.result.tiktok_views).toBe(1234);
    expect(concept.result.sent_at).toBe('2026-04-12T00:00:00Z');
    expect(concept.markers.tags).toEqual(['hook', 'voiceover']);
    expect(concept.row_kind).toBe('assignment');
  });

  it('preserves a placed concept with positive feed_order so the planner can locate it', () => {
    const concept = normalizeStudioCustomerConcept(rawRow({ feed_order: 3 }));
    expect(concept.placement.feed_order).toBe(3);
  });

  it('treats rows without concept_id as imported_history with no source assignment', () => {
    const concept = normalizeStudioCustomerConcept(
      rawRow({ concept_id: null, history_source: 'tiktok_profile' })
    );
    expect(concept.row_kind).toBe('imported_history');
    expect(concept.concept_id).toBeNull();
    expect(concept.assignment.has_source_concept).toBe(false);
    expect(concept.origin.history_source).toBe('tiktok_profile');
  });

  it('coerces missing/invalid feed_order to null instead of leaving placement undefined', () => {
    const concept = normalizeStudioCustomerConcept(rawRow({ feed_order: null }));
    expect(concept.placement).toBeDefined();
    expect(concept.placement.feed_order).toBeNull();
  });

  it('prefers DB row_kind=assignment over heuristic fallback', () => {
    const concept = normalizeStudioCustomerConcept(
      rawRow({ row_kind: 'assignment', concept_id: 'concept-1' })
    );
    expect(concept.row_kind).toBe('assignment');
    expect(concept.assignment.has_source_concept).toBe(true);
  });

  it('maps DB row_kind=history_import to frontend imported_history', () => {
    const concept = normalizeStudioCustomerConcept(
      rawRow({ row_kind: 'history_import', concept_id: null, status: 'history_import' })
    );
    expect(concept.row_kind).toBe('imported_history');
    expect(concept.concept_id).toBeNull();
    expect(concept.assignment.has_source_concept).toBe(false);
  });

  it('maps DB row_kind=collaboration to frontend collaboration', () => {
    const concept = normalizeStudioCustomerConcept(
      rawRow({ row_kind: 'collaboration', concept_id: null, visual_variant: 'collaboration' })
    );
    expect(concept.row_kind).toBe('collaboration');
    expect(concept.concept_id).toBeNull();
    expect(concept.assignment.has_source_concept).toBe(false);
  });

  it('resolves collaboration via visual_variant heuristic when row_kind is absent', () => {
    const concept = normalizeStudioCustomerConcept(
      rawRow({ concept_id: null, visual_variant: 'collaboration', status: 'draft' })
    );
    expect(concept.row_kind).toBe('collaboration');
    expect(concept.assignment.has_source_concept).toBe(false);
  });

  it('never classifies a collaboration row as imported_history', () => {
    const concept = normalizeStudioCustomerConcept(
      rawRow({
        row_kind: 'collaboration',
        concept_id: null,
        visual_variant: 'collaboration',
        history_source: null,
        status: 'draft',
      })
    );
    expect(concept.row_kind).toBe('collaboration');
    expect(concept.row_kind).not.toBe('imported_history');
  });

  it('DB row_kind=collaboration wins over history_source heuristic that would otherwise classify as history', () => {
    const concept = normalizeStudioCustomerConcept(
      rawRow({
        row_kind: 'collaboration',
        concept_id: null,
        visual_variant: 'collaboration',
        history_source: 'tiktok_profile',
        status: 'history_import',
      })
    );
    expect(concept.row_kind).toBe('collaboration');
  });
});
