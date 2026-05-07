import { describe, it, expect } from 'vitest';
import {
  extractSourceUrl,
  extractGcsUri,
  normalizeHagenError,
  buildSuggestedOverrides,
  buildReanalyzeResponse,
} from './studio-helpers.js';

// ---------------------------------------------------------------------------
// extractSourceUrl
// ---------------------------------------------------------------------------
describe('extractSourceUrl', () => {
  it('extracts from url key', () => {
    expect(extractSourceUrl({ url: 'https://example.com/video.mp4' })).toBe('https://example.com/video.mp4');
  });

  it('extracts from source_url key', () => {
    expect(extractSourceUrl({ source_url: 'https://example.com/src' })).toBe('https://example.com/src');
  });

  it('extracts from sourceUrl key', () => {
    expect(extractSourceUrl({ sourceUrl: 'https://example.com/camel' })).toBe('https://example.com/camel');
  });

  it('extracts from video_url key', () => {
    expect(extractSourceUrl({ video_url: 'https://example.com/video' })).toBe('https://example.com/video');
  });

  it('extracts from tiktok_url key', () => {
    expect(extractSourceUrl({ tiktok_url: 'https://tiktok.com/@user/video/123' })).toBe('https://tiktok.com/@user/video/123');
  });

  it('prefers url over source_url when both present', () => {
    expect(extractSourceUrl({ url: 'https://first.com', source_url: 'https://second.com' })).toBe('https://first.com');
  });

  it('skips empty strings and falls through to next key', () => {
    expect(extractSourceUrl({ url: '', source_url: 'https://fallback.com' })).toBe('https://fallback.com');
  });

  it('returns empty string when no key present', () => {
    expect(extractSourceUrl({ gcs_uri: 'gs://bucket/file' })).toBe('');
  });

  it('returns empty string for empty object', () => {
    expect(extractSourceUrl({})).toBe('');
  });

  it('trims whitespace from the extracted value', () => {
    expect(extractSourceUrl({ url: '  https://example.com  ' })).toBe('https://example.com');
  });
});

// ---------------------------------------------------------------------------
// extractGcsUri
// ---------------------------------------------------------------------------
describe('extractGcsUri', () => {
  it('extracts from gcs_uri key', () => {
    expect(extractGcsUri({ gcs_uri: 'gs://bucket/a.mp4' })).toBe('gs://bucket/a.mp4');
  });

  it('extracts from gcsUri key', () => {
    expect(extractGcsUri({ gcsUri: 'gs://bucket/b.mp4' })).toBe('gs://bucket/b.mp4');
  });

  it('extracts from gcsUrl key', () => {
    expect(extractGcsUri({ gcsUrl: 'gs://bucket/c.mp4' })).toBe('gs://bucket/c.mp4');
  });

  it('extracts from video_gcs_uri key', () => {
    expect(extractGcsUri({ video_gcs_uri: 'gs://bucket/d.mp4' })).toBe('gs://bucket/d.mp4');
  });

  it('prefers gcs_uri over gcsUri when both present', () => {
    expect(extractGcsUri({ gcs_uri: 'gs://first', gcsUri: 'gs://second' })).toBe('gs://first');
  });

  it('skips empty string and falls through', () => {
    expect(extractGcsUri({ gcs_uri: '', gcsUri: 'gs://fallback' })).toBe('gs://fallback');
  });

  it('returns empty string when no GCS key present', () => {
    expect(extractGcsUri({ url: 'https://example.com' })).toBe('');
  });

  it('returns empty string for empty object', () => {
    expect(extractGcsUri({})).toBe('');
  });

  it('trims whitespace', () => {
    expect(extractGcsUri({ gcs_uri: '  gs://bucket/x  ' })).toBe('gs://bucket/x');
  });
});

// ---------------------------------------------------------------------------
// normalizeHagenError
// ---------------------------------------------------------------------------
describe('normalizeHagenError', () => {
  it('returns the error field when it is a human-readable message', () => {
    expect(normalizeHagenError({ error: 'video not found' })).toBe('video not found');
  });

  it('falls back to message field when error is absent', () => {
    expect(normalizeHagenError({ message: 'rate limit exceeded' })).toBe('rate limit exceeded');
  });

  it('prefers message over error when error is an internal code (hagen-* prefix)', () => {
    const result = normalizeHagenError({
      error: 'hagen-non-json',
      message: 'Hagen returned non-JSON (502 text/html)',
    });
    expect(result).toBe('Hagen returned non-JSON (502 text/html)');
  });

  it('prefers message over error when error looks like an internal code (no spaces + dashes)', () => {
    const result = normalizeHagenError({
      error: 'hagen-invalid-json',
      message: 'Hagen returned malformed JSON',
    });
    expect(result).toBe('Hagen returned malformed JSON');
  });

  it('falls back to error code when message is absent and error is an internal code', () => {
    const result = normalizeHagenError({ error: 'hagen-unreachable' });
    expect(result).toBe('hagen-unreachable');
  });

  it('returns generic Swedish message for HTML starting with <!doctype', () => {
    const result = normalizeHagenError({ error: '<!DOCTYPE html><html>...</html>' });
    expect(result).toContain('oväntat svar');
    expect(result).not.toContain('<!DOCTYPE');
  });

  it('returns generic Swedish message for HTML starting with <html', () => {
    const result = normalizeHagenError({ error: '<html><body>404 Not Found</body></html>' });
    expect(result).toContain('oväntat svar');
  });

  it('returns generic Swedish message for HTML in message field when error absent', () => {
    const result = normalizeHagenError({ message: '<html><body>error</body></html>' });
    expect(result).toContain('oväntat svar');
  });

  it('returns generic Swedish message for tag-starting strings', () => {
    const result = normalizeHagenError({ error: '<div>error</div>' });
    expect(result).toContain('oväntat svar');
  });

  it('returns generic Swedish message when both error and message absent', () => {
    const result = normalizeHagenError({});
    expect(result).toContain('misslyckades');
  });

  it('does not treat human-readable error with dashes as an internal code', () => {
    const result = normalizeHagenError({ error: 'rate-limit exceeded for this user' });
    expect(result).toBe('rate-limit exceeded for this user');
  });
});

// ---------------------------------------------------------------------------
// buildSuggestedOverrides
// ---------------------------------------------------------------------------
describe('buildSuggestedOverrides', () => {
  it('includes all enrich keys when confirmed overrides is empty', () => {
    const enrich = { difficulty: 'easy', filmTime: '15min', peopleNeeded: '1' };
    const result = buildSuggestedOverrides(enrich, {});
    expect(result).toEqual(enrich);
  });

  it('excludes keys already present in confirmed overrides', () => {
    const enrich = { difficulty: 'easy', filmTime: '15min', peopleNeeded: '1' };
    const confirmed = { difficulty: 'hard' };
    const result = buildSuggestedOverrides(enrich, confirmed);
    expect(result).not.toHaveProperty('difficulty');
    expect(result).toHaveProperty('filmTime', '15min');
    expect(result).toHaveProperty('peopleNeeded', '1');
  });

  it('excludes ALL confirmed fields even when enrich has different values', () => {
    const enrich = { a: 'new', b: 'new', c: 'new' };
    const confirmed = { a: 'old', b: 'old' };
    const result = buildSuggestedOverrides(enrich, confirmed);
    expect(Object.keys(result)).toEqual(['c']);
  });

  it('returns empty object when all enrich keys are already confirmed', () => {
    const enrich = { difficulty: 'easy', filmTime: '15min' };
    const confirmed = { difficulty: 'hard', filmTime: '30min' };
    expect(buildSuggestedOverrides(enrich, confirmed)).toEqual({});
  });

  it('does not mutate the input objects', () => {
    const enrich = { difficulty: 'easy' };
    const confirmed = {};
    buildSuggestedOverrides(enrich, confirmed);
    expect(enrich).toEqual({ difficulty: 'easy' });
    expect(confirmed).toEqual({});
  });

  it('handles array values (businessTypes) correctly', () => {
    const enrich = { businessTypes: ['restaurant', 'cafe'], difficulty: 'medium' };
    const confirmed = {};
    const result = buildSuggestedOverrides(enrich, confirmed);
    expect(result['businessTypes']).toEqual(['restaurant', 'cafe']);
  });

  it('excludes businessTypes when already in confirmed overrides', () => {
    const enrich = { businessTypes: ['restaurant'] };
    const confirmed = { businessTypes: ['hotel'] };
    expect(buildSuggestedOverrides(enrich, confirmed)).toEqual({});
  });
});

// ---------------------------------------------------------------------------
// buildReanalyzeResponse
// ---------------------------------------------------------------------------
describe('buildReanalyzeResponse', () => {
  it('returns the expected shape for full_reanalyze', () => {
    const bd = { url: 'https://example.com', gcs_uri: 'gs://bucket/x' };
    const sug = { difficulty: 'easy' };
    const result = buildReanalyzeResponse({ strategy: 'full_reanalyze', backendData: bd, suggestedOverrides: sug });
    expect(result.strategy).toBe('full_reanalyze');
    expect(result.backend_data).toBe(bd);
    expect(result.suggested_overrides).toBe(sug);
    expect(result.enrich_failed).toBeUndefined();
  });

  it('returns the expected shape for enrich_only', () => {
    const bd = { gcs_uri: 'gs://x' };
    const result = buildReanalyzeResponse({ strategy: 'enrich_only', backendData: bd, suggestedOverrides: {} });
    expect(result.strategy).toBe('enrich_only');
    expect(result.enrich_failed).toBeUndefined();
  });

  it('includes enrich_failed: true when enrichFailed is true', () => {
    const result = buildReanalyzeResponse({
      strategy: 'full_reanalyze',
      backendData: {},
      suggestedOverrides: {},
      enrichFailed: true,
    });
    expect(result.enrich_failed).toBe(true);
  });

  it('does not include enrich_failed when enrichFailed is false', () => {
    const result = buildReanalyzeResponse({
      strategy: 'enrich_only',
      backendData: {},
      suggestedOverrides: {},
      enrichFailed: false,
    });
    expect(result.enrich_failed).toBeUndefined();
  });

  it('has no side effects — calling it twice returns independent objects', () => {
    const bd = { gcs_uri: 'gs://y' };
    const r1 = buildReanalyzeResponse({ strategy: 'enrich_only', backendData: bd, suggestedOverrides: { x: 1 } });
    const r2 = buildReanalyzeResponse({ strategy: 'full_reanalyze', backendData: bd, suggestedOverrides: { y: 2 } });
    expect(r1.strategy).toBe('enrich_only');
    expect(r2.strategy).toBe('full_reanalyze');
    expect(r1.suggested_overrides).not.toBe(r2.suggested_overrides);
  });
});
