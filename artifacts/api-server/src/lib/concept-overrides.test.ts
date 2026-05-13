import { describe, it, expect } from 'vitest';
import {
  normalizeOverrides,
  validateNewConceptOverrides,
  computeDryRunCandidate,
  buildDryRunSummary,
  checkStaleDryRun,
  OVERRIDES_VERSION,
} from './concept-overrides.js';

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
// computeDryRunCandidate
// ---------------------------------------------------------------------------
describe('computeDryRunCandidate', () => {
  const base = { id: 'abc-123', source: 'hagen' as string | null };

  it('reports would_change=false for an already-normalized concept', () => {
    const row = { ...base, overrides: { overrides_version: OVERRIDES_VERSION, difficulty: 'easy' } };
    const result = computeDryRunCandidate(row);
    expect(result.would_change).toBe(false);
    expect(result.change_keys).toEqual([]);
  });

  it('detects missing overrides_version', () => {
    const row = { ...base, overrides: { difficulty: 'easy' } };
    const result = computeDryRunCandidate(row);
    expect(result.would_change).toBe(true);
    expect(result.change_keys).toContain('add_overrides_version');
    expect(result.current_overrides_version).toBeNull();
    expect(result.next_overrides_version).toBe(OVERRIDES_VERSION);
  });

  it('detects wrong overrides_version (e.g. v0)', () => {
    const row = { ...base, overrides: { overrides_version: 'v0', difficulty: 'easy' } };
    const result = computeDryRunCandidate(row);
    expect(result.change_keys).toContain('add_overrides_version');
    expect(result.current_overrides_version).toBe('v0');
  });

  it('detects remove_estimatedBudget', () => {
    const row = { ...base, overrides: { estimatedBudget: '50000', difficulty: 'easy' } };
    const result = computeDryRunCandidate(row);
    expect(result.change_keys).toContain('remove_estimatedBudget');
    expect(result.would_change).toBe(true);
  });

  it('detects remove_trendLevel', () => {
    const row = { ...base, overrides: { trendLevel: 3, difficulty: 'easy' } };
    const result = computeDryRunCandidate(row);
    expect(result.change_keys).toContain('remove_trendLevel');
  });

  it('detects remove_hasScript when script_mode is present', () => {
    const row = { ...base, overrides: { hasScript: true, script_mode: 'short_dialogue' } };
    const result = computeDryRunCandidate(row);
    expect(result.change_keys).toContain('remove_hasScript');
  });

  it('does NOT flag remove_hasScript when script_mode is absent', () => {
    const row = { ...base, overrides: { hasScript: true } };
    const result = computeDryRunCandidate(row);
    expect(result.change_keys).not.toContain('remove_hasScript');
  });

  it('does NOT flag remove_hasScript when script_mode is null', () => {
    const row = { ...base, overrides: { hasScript: true, script_mode: null } };
    const result = computeDryRunCandidate(row);
    expect(result.change_keys).not.toContain('remove_hasScript');
  });

  it('returns all change_keys for a fully deprecated concept', () => {
    const row = {
      ...base,
      overrides: {
        estimatedBudget: '10000',
        trendLevel: 2,
        hasScript: false,
        script_mode: 'visual_only',
        difficulty: 'medium',
      },
    };
    const result = computeDryRunCandidate(row);
    expect(result.change_keys).toContain('add_overrides_version');
    expect(result.change_keys).toContain('remove_estimatedBudget');
    expect(result.change_keys).toContain('remove_trendLevel');
    expect(result.change_keys).toContain('remove_hasScript');
    expect(result.would_change).toBe(true);
    expect(result.warnings.length).toBeGreaterThanOrEqual(3);
  });

  it('handles null overrides gracefully', () => {
    const row = { ...base, overrides: null };
    const result = computeDryRunCandidate(row);
    expect(result.would_change).toBe(true);
    expect(result.change_keys).toContain('add_overrides_version');
    expect(result.current_overrides_version).toBeNull();
  });

  it('preserves id and source in output', () => {
    const row = { id: 'my-id', source: 'cm_created', overrides: null };
    const result = computeDryRunCandidate(row);
    expect(result.id).toBe('my-id');
    expect(result.source).toBe('cm_created');
  });

  it('passes null source through', () => {
    const row = { id: 'my-id', source: null, overrides: null };
    const result = computeDryRunCandidate(row);
    expect(result.source).toBeNull();
  });

  it('does not include script/headline values in output', () => {
    const row = {
      ...base,
      overrides: { headline_sv: 'En rubrik', script_sv: 'Ett manus', difficulty: 'easy' },
    };
    const result = computeDryRunCandidate(row);
    // The DryRunCandidate shape should never surface content fields
    expect(result).not.toHaveProperty('headline_sv');
    expect(result).not.toHaveProperty('script_sv');
  });

  it('no DB mutation path — computeDryRunCandidate is a pure function', () => {
    // This test verifies the contract: the function only reads its input and returns a value.
    // If it had a DB call it would need async + a mock.
    const row = { ...base, overrides: { estimatedBudget: '1000' } };
    const result = computeDryRunCandidate(row);
    // Pure: calling twice gives same result
    const result2 = computeDryRunCandidate(row);
    expect(result).toEqual(result2);
  });
});

// ---------------------------------------------------------------------------
// buildDryRunSummary
// ---------------------------------------------------------------------------
describe('buildDryRunSummary', () => {
  const makeCandidate = (overrides: Record<string, unknown> | null, id = 'x') =>
    computeDryRunCandidate({ id, source: 'hagen', overrides });

  it('returns zero counts for an empty candidate list', () => {
    const s = buildDryRunSummary([]);
    expect(s.total).toBe(0);
    expect(s.would_change).toBe(0);
  });

  it('counts already-normalized concepts as would_change=0', () => {
    const c = makeCandidate({ overrides_version: OVERRIDES_VERSION, difficulty: 'easy' });
    const s = buildDryRunSummary([c]);
    expect(s.total).toBe(1);
    expect(s.would_change).toBe(0);
  });

  it('counts deprecated concepts correctly', () => {
    const c1 = makeCandidate({ estimatedBudget: '10000' }, 'a');
    const c2 = makeCandidate({ trendLevel: 2, hasScript: true, script_mode: 'none' }, 'b');
    const c3 = makeCandidate({ overrides_version: OVERRIDES_VERSION }, 'c');
    const s = buildDryRunSummary([c1, c2, c3]);
    expect(s.total).toBe(3);
    expect(s.would_change).toBe(2);
    expect(s.would_remove_estimatedBudget).toBe(1);
    expect(s.would_remove_trendLevel).toBe(1);
    expect(s.would_remove_hasScript).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// checkStaleDryRun
// ---------------------------------------------------------------------------
describe('checkStaleDryRun', () => {
  const match = { expected_total: 33, expected_would_change: 33, actual_total: 33, actual_would_change: 33 };

  it('returns stale=false when counts match', () => {
    expect(checkStaleDryRun(match).stale).toBe(false);
  });

  it('returns stale=true when total has changed', () => {
    const result = checkStaleDryRun({ ...match, actual_total: 34 });
    expect(result.stale).toBe(true);
    expect(result.reason).toMatch(/total changed/);
    expect(result.reason).toContain('33');
    expect(result.reason).toContain('34');
  });

  it('returns stale=true when would_change count has changed', () => {
    const result = checkStaleDryRun({ ...match, actual_would_change: 30 });
    expect(result.stale).toBe(true);
    expect(result.reason).toMatch(/would_change count changed/);
  });

  it('total mismatch takes priority over would_change mismatch', () => {
    const result = checkStaleDryRun({ ...match, actual_total: 35, actual_would_change: 30 });
    expect(result.stale).toBe(true);
    expect(result.reason).toMatch(/total changed/);
  });

  it('returns no reason when not stale', () => {
    const result = checkStaleDryRun(match);
    expect(result.reason).toBeUndefined();
  });

  it('handles zero counts correctly', () => {
    const result = checkStaleDryRun({ expected_total: 0, expected_would_change: 0, actual_total: 0, actual_would_change: 0 });
    expect(result.stale).toBe(false);
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
