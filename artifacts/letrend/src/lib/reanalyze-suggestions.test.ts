import { describe, it, expect } from 'vitest';
import { buildSuggestionsFromOverrides, hasApplicableSuggestions, countApplicableSuggestions, getSuggestionState } from './reanalyze-suggestions';
import type { SuggestableFields } from './reanalyze-suggestions';

// ---------------------------------------------------------------------------
// buildSuggestionsFromOverrides
// ---------------------------------------------------------------------------

describe('buildSuggestionsFromOverrides', () => {
  it('returns null for all fields when suggested_overrides is empty', () => {
    const result = buildSuggestionsFromOverrides({});
    expect(result.script_mode).toBeNull();
    expect(result.setup_complexity).toBeNull();
    expect(result.skill_required).toBeNull();
    expect(result.setting).toBeNull();
    expect(result.peopleNeeded).toBeNull();
    expect(result.difficulty).toBeNull();
    expect(result.filmTime).toBeNull();
    expect(result.businessTypes).toBeNull();
  });

  it('picks scalar string fields from suggested_overrides', () => {
    const sug = {
      script_mode: 'visual_only',
      setup_complexity: 'point_and_shoot',
      skill_required: 'anyone',
      setting: 'any_venue',
      peopleNeeded: 'solo',
      difficulty: 'easy',
      filmTime: 'under_15min',
    };
    const result = buildSuggestionsFromOverrides(sug);
    expect(result.script_mode).toBe('visual_only');
    expect(result.setup_complexity).toBe('point_and_shoot');
    expect(result.skill_required).toBe('anyone');
    expect(result.setting).toBe('any_venue');
    expect(result.peopleNeeded).toBe('solo');
    expect(result.difficulty).toBe('easy');
    expect(result.filmTime).toBe('under_15min');
  });

  it('picks businessTypes array correctly', () => {
    const result = buildSuggestionsFromOverrides({
      businessTypes: ['hospitality', 'retail'],
    });
    expect(result.businessTypes).toEqual(['hospitality', 'retail']);
  });

  it('filters non-string values out of businessTypes array', () => {
    const result = buildSuggestionsFromOverrides({
      businessTypes: ['hospitality', 42, null, 'retail'],
    });
    expect(result.businessTypes).toEqual(['hospitality', 'retail']);
  });

  it('returns null businessTypes when the field is not an array', () => {
    expect(buildSuggestionsFromOverrides({ businessTypes: 'hospitality' }).businessTypes).toBeNull();
    expect(buildSuggestionsFromOverrides({ businessTypes: null }).businessTypes).toBeNull();
    expect(buildSuggestionsFromOverrides({}).businessTypes).toBeNull();
  });

  it('returns null for a field when its value is not a string (e.g. number)', () => {
    const result = buildSuggestionsFromOverrides({ script_mode: 42, difficulty: true });
    expect(result.script_mode).toBeNull();
    expect(result.difficulty).toBeNull();
  });

  it('confirmed/suppressed field missing from suggested_overrides → null (not shown as suggestion)', () => {
    // Simulates the backend having filtered out script_mode because it was in confirmedOverrides
    const sug = { difficulty: 'medium' };
    const result = buildSuggestionsFromOverrides(sug);
    expect(result.script_mode).toBeNull();
    expect(result.difficulty).toBe('medium');
  });

  it('ignores irrelevant keys (does not leak unknown fields)', () => {
    const result = buildSuggestionsFromOverrides({
      headline_sv: 'Irrelevant subjective field',
      script_mode: 'none',
    });
    expect(result.script_mode).toBe('none');
    expect((result as Record<string, unknown>)['headline_sv']).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// hasApplicableSuggestions
// ---------------------------------------------------------------------------

describe('hasApplicableSuggestions', () => {
  const nullFields = {
    script_mode: null,
    setup_complexity: null,
    skill_required: null,
    setting: null,
    peopleNeeded: null,
    difficulty: null,
    filmTime: null,
    businessTypes: null,
  };

  it('returns false when all fields are null (no suggestions — all confirmed or suppressed)', () => {
    expect(hasApplicableSuggestions(nullFields)).toBe(false);
  });

  it('returns false when businessTypes is an empty array', () => {
    expect(hasApplicableSuggestions({ ...nullFields, businessTypes: [] })).toBe(false);
  });

  it('returns true when any scalar field is non-null', () => {
    expect(hasApplicableSuggestions({ ...nullFields, script_mode: 'visual_only' })).toBe(true);
    expect(hasApplicableSuggestions({ ...nullFields, difficulty: 'easy' })).toBe(true);
    expect(hasApplicableSuggestions({ ...nullFields, filmTime: 'under_15min' })).toBe(true);
  });

  it('returns true when businessTypes has at least one entry', () => {
    expect(hasApplicableSuggestions({ ...nullFields, businessTypes: ['hospitality'] })).toBe(true);
  });

  it('returns true when multiple fields are present', () => {
    expect(hasApplicableSuggestions({
      ...nullFields,
      script_mode: 'none',
      difficulty: 'medium',
      businessTypes: ['retail'],
    })).toBe(true);
  });

  it('no applicable suggestions + pending backend_data → UI should show "no suggestions" copy', () => {
    // This test documents the expected UI state contract:
    // when hasApplicableSuggestions returns false, the review page must show
    // "Ny analysdata är redo att sparas. Inga nya klassificeringsförslag kunde
    //  tillämpas utan att röra bekräftade värden." — NOT "Inga ändringar att tillämpa".
    const fields = buildSuggestionsFromOverrides({});
    expect(hasApplicableSuggestions(fields)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// countApplicableSuggestions
// ---------------------------------------------------------------------------

describe('countApplicableSuggestions', () => {
  const nullFields: SuggestableFields = {
    script_mode: null,
    setup_complexity: null,
    skill_required: null,
    setting: null,
    peopleNeeded: null,
    difficulty: null,
    filmTime: null,
    businessTypes: null,
  };

  it('returns 0 when all fields are null', () => {
    expect(countApplicableSuggestions(nullFields)).toBe(0);
  });

  it('returns 0 when businessTypes is an empty array', () => {
    expect(countApplicableSuggestions({ ...nullFields, businessTypes: [] })).toBe(0);
  });

  it('counts each non-null scalar field as 1', () => {
    expect(countApplicableSuggestions({ ...nullFields, script_mode: 'visual_only' })).toBe(1);
    expect(countApplicableSuggestions({ ...nullFields, difficulty: 'easy', filmTime: 'under_15min' })).toBe(2);
  });

  it('counts businessTypes as 1 regardless of how many types are in the array', () => {
    expect(countApplicableSuggestions({ ...nullFields, businessTypes: ['hospitality'] })).toBe(1);
    expect(countApplicableSuggestions({ ...nullFields, businessTypes: ['hospitality', 'retail', 'food'] })).toBe(1);
  });

  it('returns 8 when all fields are non-null', () => {
    const full: SuggestableFields = {
      script_mode: 'visual_only',
      setup_complexity: 'point_and_shoot',
      skill_required: 'anyone',
      setting: 'any_venue',
      peopleNeeded: 'solo',
      difficulty: 'easy',
      filmTime: 'under_15min',
      businessTypes: ['hospitality'],
    };
    expect(countApplicableSuggestions(full)).toBe(8);
  });

  it('reflects backend suppression: suppressed field → count decreases', () => {
    // script_mode was confirmed by CM → backend filtered it → not in suggested_overrides
    const fromBackend = buildSuggestionsFromOverrides({
      difficulty: 'medium',
      filmTime: 'under_30min',
      // script_mode intentionally absent — backend filtered it
    });
    expect(countApplicableSuggestions(fromBackend)).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// getSuggestionState
// ---------------------------------------------------------------------------

describe('getSuggestionState', () => {
  const nullFields: SuggestableFields = {
    script_mode: null,
    setup_complexity: null,
    skill_required: null,
    setting: null,
    peopleNeeded: null,
    difficulty: null,
    filmTime: null,
    businessTypes: null,
  };

  it('returns "enrich_failed" when enrichFailed is true, regardless of fields', () => {
    expect(getSuggestionState(nullFields, true)).toBe('enrich_failed');
    expect(getSuggestionState({ ...nullFields, script_mode: 'visual_only' }, true)).toBe('enrich_failed');
  });

  it('returns "suppressed" when enrichFailed is false and all fields are null', () => {
    expect(getSuggestionState(nullFields, false)).toBe('suppressed');
    expect(getSuggestionState(nullFields, undefined)).toBe('suppressed');
  });

  it('returns "has_suggestions" when at least one field is non-null', () => {
    expect(getSuggestionState({ ...nullFields, difficulty: 'medium' }, false)).toBe('has_suggestions');
    expect(getSuggestionState({ ...nullFields, businessTypes: ['retail'] }, false)).toBe('has_suggestions');
  });

  it('returns "suppressed" when businessTypes is empty array (no actual suggestions)', () => {
    expect(getSuggestionState({ ...nullFields, businessTypes: [] }, false)).toBe('suppressed');
  });

  it('live smoke contract: all fields confirmed → state is suppressed', () => {
    // Simulates: CM has confirmed all 8 suggestable fields → backend filters all → frontend gets {}
    const fields = buildSuggestionsFromOverrides({});
    expect(getSuggestionState(fields, false)).toBe('suppressed');
    expect(countApplicableSuggestions(fields)).toBe(0);
  });

  it('live smoke contract: 2 of 5 legacy fields confirmed → state is has_suggestions', () => {
    // Simulates: CM confirmed peopleNeeded + difficulty → backend filters those 2 →
    // filmTime + businessTypes + script_mode still come through
    const fields = buildSuggestionsFromOverrides({
      filmTime: 'under_30min',
      businessTypes: ['hospitality'],
      script_mode: 'visual_only',
    });
    expect(getSuggestionState(fields, false)).toBe('has_suggestions');
    expect(countApplicableSuggestions(fields)).toBe(3);
  });
});
