import { describe, it, expect } from 'vitest';
import { matchScriptMode } from '@/lib/script-mode-filter';

describe('matchScriptMode — filter: all', () => {
  it('always returns true', () => {
    expect(matchScriptMode(true, 'text_overlay', 'all')).toBe(true);
    expect(matchScriptMode(false, undefined, 'all')).toBe(true);
    expect(matchScriptMode(undefined, undefined, 'all')).toBe(true);
  });
});

describe('matchScriptMode — filter: with_script', () => {
  it('returns true for explicit scripted modes', () => {
    expect(matchScriptMode(false, 'text_overlay', 'with_script')).toBe(true);
    expect(matchScriptMode(false, 'short_dialogue', 'with_script')).toBe(true);
    expect(matchScriptMode(false, 'long_dialogue', 'with_script')).toBe(true);
  });

  it('returns false for explicit non-scripted modes', () => {
    expect(matchScriptMode(true, 'visual_only', 'with_script')).toBe(false);
    expect(matchScriptMode(true, 'none', 'with_script')).toBe(false);
  });

  it('falls back to hasScript=true for old concepts (no explicit override)', () => {
    expect(matchScriptMode(true, undefined, 'with_script')).toBe(true);
  });

  it('falls back to hasScript=false for old concepts (no explicit override)', () => {
    expect(matchScriptMode(false, undefined, 'with_script')).toBe(false);
  });
});

describe('matchScriptMode — filter: without_script', () => {
  it('returns true for explicit visual_only', () => {
    expect(matchScriptMode(true, 'visual_only', 'without_script')).toBe(true);
  });

  it('returns true for explicit none', () => {
    expect(matchScriptMode(true, 'none', 'without_script')).toBe(true);
  });

  it('returns false for explicit scripted modes', () => {
    expect(matchScriptMode(false, 'text_overlay', 'without_script')).toBe(false);
    expect(matchScriptMode(false, 'short_dialogue', 'without_script')).toBe(false);
  });

  it('falls back to hasScript=false for old concepts (no explicit override)', () => {
    expect(matchScriptMode(false, undefined, 'without_script')).toBe(true);
  });

  it('falls back to hasScript=true for old concepts (no explicit override)', () => {
    expect(matchScriptMode(true, undefined, 'without_script')).toBe(false);
  });
});

describe('matchScriptMode — specific mode filters (provenance-safe)', () => {
  it('explicit text_overlay matches text_overlay filter', () => {
    expect(matchScriptMode(false, 'text_overlay', 'text_overlay')).toBe(true);
  });

  it('explicit text_overlay does NOT match short_dialogue filter', () => {
    expect(matchScriptMode(true, 'text_overlay', 'short_dialogue')).toBe(false);
  });

  it('inferred text_overlay (no explicit override) does NOT match text_overlay filter', () => {
    // sigma-inferred: concept.script_mode === 'text_overlay' but raw_overrides has no script_mode
    expect(matchScriptMode(true, undefined, 'text_overlay')).toBe(false);
  });

  it('old hasScript=true does NOT match text_overlay (no explicit override)', () => {
    expect(matchScriptMode(true, undefined, 'short_dialogue')).toBe(false);
    expect(matchScriptMode(true, undefined, 'long_dialogue')).toBe(false);
  });

  it('old hasScript=false does NOT match visual_only or none (no explicit override)', () => {
    expect(matchScriptMode(false, undefined, 'visual_only')).toBe(false);
    expect(matchScriptMode(false, undefined, 'none')).toBe(false);
  });

  it('explicit visual_only matches without_script AND visual_only filter', () => {
    expect(matchScriptMode(true, 'visual_only', 'without_script')).toBe(true);
    expect(matchScriptMode(true, 'visual_only', 'visual_only')).toBe(true);
  });

  it('explicit short_dialogue matches with_script AND short_dialogue filter', () => {
    expect(matchScriptMode(false, 'short_dialogue', 'with_script')).toBe(true);
    expect(matchScriptMode(false, 'short_dialogue', 'short_dialogue')).toBe(true);
  });
});
