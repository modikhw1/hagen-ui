import { describe, it, expect } from 'vitest';
import { normalizeOverrides, validateNewConceptOverrides, OVERRIDES_VERSION } from './concept-overrides.js';

// ---------------------------------------------------------------------------
// normalizeOverrides
// ---------------------------------------------------------------------------
describe('normalizeOverrides', () => {
  it('strips estimatedBudget', () => {
    const { overrides, warnings } = normalizeOverrides({ estimatedBudget: '50000', difficulty: 'easy' });
    expect(overrides).not.toHaveProperty('estimatedBudget');
    expect(warnings).toContain('deprecated field stripped: estimatedBudget');
  });

  it('strips trendLevel', () => {
    const { overrides, warnings } = normalizeOverrides({ trendLevel: 3, difficulty: 'easy' });
    expect(overrides).not.toHaveProperty('trendLevel');
    expect(warnings).toContain('deprecated field stripped: trendLevel');
  });

  it('strips hasScript when script_mode is present', () => {
    const { overrides, warnings } = normalizeOverrides({
      hasScript: true,
      script_mode: 'short_dialogue',
    });
    expect(overrides).not.toHaveProperty('hasScript');
    expect(overrides['script_mode']).toBe('short_dialogue');
    expect(warnings).toContain('hasScript stripped: script_mode is canonical');
  });

  it('keeps hasScript when script_mode is absent', () => {
    const { overrides } = normalizeOverrides({ hasScript: true });
    expect(overrides['hasScript']).toBe(true);
  });

  it('keeps hasScript when script_mode is null', () => {
    const { overrides } = normalizeOverrides({ hasScript: true, script_mode: null });
    expect(overrides['hasScript']).toBe(true);
  });

  it('keeps mechanism when present', () => {
    const { overrides } = normalizeOverrides({ mechanism: 'irony', script_mode: 'none' });
    expect(overrides['mechanism']).toBe('irony');
  });

  it('does not require mechanism — passes without it', () => {
    const { overrides } = normalizeOverrides({ script_mode: 'none', difficulty: 'easy' });
    expect(overrides).not.toHaveProperty('mechanism');
  });

  it('adds overrides_version v1', () => {
    const { overrides } = normalizeOverrides({ difficulty: 'easy' });
    expect(overrides['overrides_version']).toBe(OVERRIDES_VERSION);
  });

  it('overwrites an existing overrides_version', () => {
    const { overrides } = normalizeOverrides({ overrides_version: 'v0', difficulty: 'easy' });
    expect(overrides['overrides_version']).toBe(OVERRIDES_VERSION);
  });

  it('preserves unknown non-deprecated keys for backward compat', () => {
    const { overrides } = normalizeOverrides({ someOldKey: 'value', difficulty: 'easy' });
    expect(overrides['someOldKey']).toBe('value');
  });

  it('handles null input gracefully', () => {
    const { overrides } = normalizeOverrides(null);
    expect(overrides['overrides_version']).toBe(OVERRIDES_VERSION);
    expect(Object.keys(overrides)).toHaveLength(1);
  });

  it('handles non-object input gracefully', () => {
    const { overrides } = normalizeOverrides('invalid');
    expect(overrides['overrides_version']).toBe(OVERRIDES_VERSION);
  });

  it('strips both deprecated fields in one pass', () => {
    const { overrides, warnings } = normalizeOverrides({
      estimatedBudget: '10000',
      trendLevel: 2,
      hasScript: false,
      script_mode: 'visual_only',
      difficulty: 'medium',
    });
    expect(overrides).not.toHaveProperty('estimatedBudget');
    expect(overrides).not.toHaveProperty('trendLevel');
    expect(overrides).not.toHaveProperty('hasScript');
    expect(overrides['difficulty']).toBe('medium');
    expect(warnings).toHaveLength(3);
  });
});

// ---------------------------------------------------------------------------
// validateNewConceptOverrides
// ---------------------------------------------------------------------------
describe('validateNewConceptOverrides', () => {
  const validBase = {
    script_mode: 'none',
    difficulty: 'easy',
    filmTime: 'under_1_min',
    peopleNeeded: 'solo',
    businessTypes: ['ecommerce'],
  };

  it('returns empty array for a complete valid concept', () => {
    expect(validateNewConceptOverrides(validBase)).toEqual([]);
  });

  it('does not require mechanism', () => {
    const withoutMechanism = { ...validBase };
    expect(validateNewConceptOverrides(withoutMechanism)).toEqual([]);
  });

  it('returns missing field names when required fields are absent', () => {
    const missing = validateNewConceptOverrides({});
    expect(missing).toContain('script_mode');
    expect(missing).toContain('difficulty');
    expect(missing).toContain('filmTime');
    expect(missing).toContain('peopleNeeded');
    expect(missing).toContain('businessTypes');
  });

  it('returns businessTypes when array is empty', () => {
    const missing = validateNewConceptOverrides({ ...validBase, businessTypes: [] });
    expect(missing).toContain('businessTypes');
  });

  it('returns businessTypes when value is not an array', () => {
    const missing = validateNewConceptOverrides({ ...validBase, businessTypes: 'ecommerce' });
    expect(missing).toContain('businessTypes');
  });

  it('returns only the specific missing fields', () => {
    const missing = validateNewConceptOverrides({ ...validBase, script_mode: undefined });
    expect(missing).toEqual(['script_mode']);
  });

  it('returns difficulty when value is empty string', () => {
    const missing = validateNewConceptOverrides({ ...validBase, difficulty: '' });
    expect(missing).toContain('difficulty');
  });
});
