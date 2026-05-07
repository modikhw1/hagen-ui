import { describe, it, expect } from 'vitest';
import { mergeResultInto, appendWarningTo } from './ingest-runs.js';

describe('mergeResultInto', () => {
  it('merges new key into empty existing result', () => {
    const result = mergeResultInto({}, { analyze_summary: { gcs_uri: 'gs://test' } });
    expect(result).toEqual({ analyze_summary: { gcs_uri: 'gs://test' } });
  });

  it('adds new key without removing existing keys', () => {
    const existing = { analyze_summary: { has_analysis: true } };
    const result = mergeResultInto(existing, { enrich_summary: { has_overrides: true } });
    expect(result).toEqual({
      analyze_summary: { has_analysis: true },
      enrich_summary: { has_overrides: true },
    });
  });

  it('overwrites matching key with new value', () => {
    const existing = { humor_enrich: { status: 'running' } };
    const result = mergeResultInto(existing, { humor_enrich: { status: 'completed', fields: {} } });
    expect(result['humor_enrich']).toEqual({ status: 'completed', fields: {} });
    // Other keys untouched — none here, just verify humor_enrich replaced
    expect(Object.keys(result)).toEqual(['humor_enrich']);
  });

  it('preserves three coexisting summary keys', () => {
    const r1 = mergeResultInto({}, { analyze_summary: { gcs_uri: 'gs://a' } });
    const r2 = mergeResultInto(r1, { enrich_summary: { has_overrides: false } });
    const r3 = mergeResultInto(r2, { humor_enrich: { status: 'completed' } });
    expect(r3).toEqual({
      analyze_summary: { gcs_uri: 'gs://a' },
      enrich_summary: { has_overrides: false },
      humor_enrich: { status: 'completed' },
    });
  });

  it('does not mutate the existing object', () => {
    const existing: Record<string, unknown> = { analyze_summary: { gcs_uri: 'gs://x' } };
    mergeResultInto(existing, { enrich_summary: { has_overrides: true } });
    expect(Object.keys(existing)).toEqual(['analyze_summary']);
  });
});

describe('appendWarningTo', () => {
  it('appends a warning to an empty array', () => {
    const result = appendWarningTo([], { stage: 'analyzing', error: 'timeout' });
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ stage: 'analyzing', error: 'timeout' });
  });

  it('preserves existing warnings', () => {
    const existing = [{ stage: 'analyzing', error: 'network' }];
    const result = appendWarningTo(existing, { stage: 'humor_enriching', error: 'tuned_model_failed' });
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ stage: 'analyzing', error: 'network' });
    expect(result[1]).toEqual({ stage: 'humor_enriching', error: 'tuned_model_failed' });
  });

  it('does not mutate the existing array', () => {
    const existing = [{ stage: 'analyzing', error: 'x' }];
    appendWarningTo(existing, { stage: 'enriching', error: 'y' });
    expect(existing).toHaveLength(1);
  });

  it('appends multiple warnings sequentially', () => {
    const w1 = appendWarningTo([], 'first');
    const w2 = appendWarningTo(w1, 'second');
    const w3 = appendWarningTo(w2, 'third');
    expect(w3).toEqual(['first', 'second', 'third']);
  });
});
