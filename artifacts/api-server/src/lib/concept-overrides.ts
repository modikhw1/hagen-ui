/**
 * Concept override normalization helpers for the ingest contract.
 *
 * Responsibilities:
 *  - Strip deprecated fields so they don't accumulate in the JSONB column.
 *  - Add overrides_version for future migration guards.
 *  - Validate required canonical fields on new cm_created saves.
 *
 * Intentionally NOT strict about unknown keys — old concepts may have keys
 * that predate the contract, and we must preserve those for backward compat.
 */

export const OVERRIDES_VERSION = 'v1' as const;

/**
 * Fields that are always stripped: they were AI-generated guesses that were
 * never CM-confirmed and have canonical replacements or are simply unreliable.
 *
 * @see ClipOverride JSDoc in artifacts/letrend/src/lib/translator.ts
 */
const DEPRECATED_ALWAYS: ReadonlySet<string> = new Set(['estimatedBudget', 'trendLevel']);

/**
 * Required for a new cm_created concept created through the upload-confirm
 * flow. These fields are set by the CM in the classify step before saving.
 * `mechanism` is intentionally absent — it is AI-only and may be absent.
 */
const REQUIRED_CANONICAL = [
  'script_mode',
  'difficulty',
  'filmTime',
  'peopleNeeded',
  'businessTypes',
] as const;

export interface NormalizeResult {
  overrides: Record<string, unknown>;
  warnings: string[];
}

/**
 * Normalize raw concept overrides for safe JSONB storage.
 *
 * Rules applied:
 *  1. Drop estimatedBudget and trendLevel (deprecated, always).
 *  2. Drop hasScript when script_mode is present and non-null
 *     (script_mode is the canonical representation; hasScript is the old boolean).
 *  3. Preserve all other keys — including unknown ones from old concepts.
 *  4. Inject overrides_version: 'v1'.
 */
export function normalizeOverrides(raw: unknown): NormalizeResult {
  const warnings: string[] = [];

  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { overrides: { overrides_version: OVERRIDES_VERSION }, warnings };
  }

  const input = raw as Record<string, unknown>;
  const hasCanonicalScriptMode = 'script_mode' in input && input['script_mode'] != null;
  const out: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(input)) {
    if (DEPRECATED_ALWAYS.has(key)) {
      warnings.push(`deprecated field stripped: ${key}`);
      continue;
    }
    if (key === 'hasScript' && hasCanonicalScriptMode) {
      warnings.push('hasScript stripped: script_mode is canonical');
      continue;
    }
    out[key] = value;
  }

  out['overrides_version'] = OVERRIDES_VERSION;
  return { overrides: out, warnings };
}

/**
 * Validate that overrides contain all required canonical fields for a new
 * cm_created concept. Returns the list of missing field names (empty = valid).
 *
 * `mechanism` is NOT required — it is AI-only and made optional in Phase 78.
 */
export function validateNewConceptOverrides(overrides: Record<string, unknown>): string[] {
  const missing: string[] = [];
  for (const field of REQUIRED_CANONICAL) {
    const value = overrides[field];
    if (field === 'businessTypes') {
      if (!Array.isArray(value) || value.length === 0) missing.push(field);
    } else {
      if (value == null || value === '') missing.push(field);
    }
  }
  return missing;
}
