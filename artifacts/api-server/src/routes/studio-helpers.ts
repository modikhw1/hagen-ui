/**
 * Pure helper functions for the studio reanalyze route.
 *
 * These functions have no imports of Supabase, Hagen clients, or Express so
 * they can be unit-tested in isolation without any external dependencies.
 */

/**
 * Extract the video source URL from backend_data.
 * Checks, in order: url, source_url, sourceUrl, video_url, tiktok_url.
 * Returns the first non-empty string found, or '' if none.
 */
export function extractSourceUrl(bd: Record<string, unknown>): string {
  const keys = ['url', 'source_url', 'sourceUrl', 'video_url', 'tiktok_url'] as const;
  for (const key of keys) {
    const val = bd[key];
    if (typeof val === 'string' && val.trim()) return val.trim();
  }
  return '';
}

/**
 * Extract the GCS URI from backend_data.
 * Checks, in order: gcs_uri, gcsUri, gcsUrl, video_gcs_uri.
 * Returns the first non-empty string found, or '' if none.
 */
export function extractGcsUri(bd: Record<string, unknown>): string {
  const keys = ['gcs_uri', 'gcsUri', 'gcsUrl', 'video_gcs_uri'] as const;
  for (const key of keys) {
    const val = bd[key];
    if (typeof val === 'string' && val.trim()) return val.trim();
  }
  return '';
}

/**
 * Normalize a Hagen upstream error body into a safe Swedish user-facing string.
 *
 * Priority:
 *  1. If `error` is present and looks like a human-readable message (contains spaces
 *     or is not an internal error code like `hagen-non-json`), use `error`.
 *  2. If `error` looks like an internal machine code (no spaces, e.g. `hagen-non-json`),
 *     prefer the more descriptive `message` field when present.
 *  3. Fall back to the `error` code, then a generic Swedish message.
 *
 * Raw HTML responses (Railway 404 pages etc.) are never forwarded — replaced with
 * a generic Swedish message instead.
 */
export function normalizeHagenError(body: Record<string, unknown>): string {
  const errorStr = typeof body['error'] === 'string' ? body['error'].trim() : '';
  const messageStr = typeof body['message'] === 'string' ? body['message'].trim() : '';

  const isInternalCode = (s: string) =>
    Boolean(s) && !s.includes(' ') && (s.startsWith('hagen-') || s.includes('-'));

  const isHtml = (s: string) => {
    const lc = s.toLowerCase();
    return lc.startsWith('<!doctype') || lc.startsWith('<html') || lc.startsWith('<');
  };

  const genericFallback = 'Analysen misslyckades. Försök igen.';
  const htmlFallback = 'Hagen-tjänsten returnerade ett oväntat svar (icke-JSON). Försök igen om en stund.';

  if (errorStr) {
    if (isHtml(errorStr)) return htmlFallback;
    if (isInternalCode(errorStr)) {
      if (messageStr && !isHtml(messageStr)) return messageStr;
      return errorStr;
    }
    return errorStr;
  }

  if (messageStr) {
    if (isHtml(messageStr)) return htmlFallback;
    return messageStr;
  }

  return genericFallback;
}

/**
 * Build the final suggested_overrides object from an Hagen enrich response.
 *
 * Keys that already exist in `confirmedOverrides` are **never** included in
 * the returned suggestions — confirmed CM values always win. This means the
 * review page will never propose overwriting something the CM already chose.
 */
export function buildSuggestedOverrides(
  enrichOverrides: Record<string, unknown>,
  confirmedOverrides: Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(enrichOverrides)) {
    if (!(key in confirmedOverrides)) {
      result[key] = value;
    }
  }
  return result;
}

export interface ReanalyzeResponseShape {
  strategy: 'full_reanalyze' | 'enrich_only';
  backend_data: Record<string, unknown>;
  suggested_overrides: Record<string, unknown>;
  enrich_failed?: true;
}

/**
 * Assemble the final JSON response shape for the reanalyze endpoint.
 * Pure function — no side effects, no I/O.
 */
export function buildReanalyzeResponse(opts: {
  strategy: 'full_reanalyze' | 'enrich_only';
  backendData: Record<string, unknown>;
  suggestedOverrides: Record<string, unknown>;
  enrichFailed?: boolean;
}): ReanalyzeResponseShape {
  const result: ReanalyzeResponseShape = {
    strategy: opts.strategy,
    backend_data: opts.backendData,
    suggested_overrides: opts.suggestedOverrides,
  };
  if (opts.enrichFailed) result.enrich_failed = true;
  return result;
}
