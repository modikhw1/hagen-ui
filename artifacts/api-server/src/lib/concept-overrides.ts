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
// ---------------------------------------------------------------------------
// Dry-run backfill helper
// ---------------------------------------------------------------------------

export type DryRunChangeKey =
  | 'add_overrides_version'
  | 'remove_estimatedBudget'
  | 'remove_trendLevel'
  | 'remove_hasScript';

export interface DryRunCandidate {
  id: string;
  source: string | null;
  would_change: boolean;
  current_overrides_version: string | null;
  next_overrides_version: string;
  change_keys: DryRunChangeKey[];
  warnings: string[];
}

/**
 * Compute what normalizeOverrides would do to a single concept row
 * without writing anything to the database.
 *
 * Safe to call with any row shape — null/undefined overrides produce a
 * single-key result with overrides_version only.
 */
export interface DryRunSummary {
  total: number;
  would_change: number;
  would_add_overrides_version: number;
  would_remove_estimatedBudget: number;
  would_remove_trendLevel: number;
  would_remove_hasScript: number;
}

/** Build a summary object from a list of dry-run candidates. Pure, no DB access. */
export function buildDryRunSummary(candidates: DryRunCandidate[]): DryRunSummary {
  const toChange = candidates.filter((c) => c.would_change);
  return {
    total: candidates.length,
    would_change: toChange.length,
    would_add_overrides_version: toChange.filter((c) => c.change_keys.includes('add_overrides_version')).length,
    would_remove_estimatedBudget: toChange.filter((c) => c.change_keys.includes('remove_estimatedBudget')).length,
    would_remove_trendLevel: toChange.filter((c) => c.change_keys.includes('remove_trendLevel')).length,
    would_remove_hasScript: toChange.filter((c) => c.change_keys.includes('remove_hasScript')).length,
  };
}

export interface StaleDryRunGuardInput {
  expected_total: number;
  expected_would_change: number;
  actual_total: number;
  actual_would_change: number;
}

export interface StaleDryRunGuardResult {
  stale: boolean;
  reason?: string;
}

/**
 * Check whether the state of the library has changed since the dry-run was
 * computed. Returns `stale: true` when the caller should refuse to apply and
 * ask for a fresh dry-run instead.
 *
 * Pure function — safe to unit-test without a DB.
 */
export function checkStaleDryRun(input: StaleDryRunGuardInput): StaleDryRunGuardResult {
  if (input.actual_total !== input.expected_total) {
    return {
      stale: true,
      reason: `total changed: expected ${input.expected_total}, got ${input.actual_total}`,
    };
  }
  if (input.actual_would_change !== input.expected_would_change) {
    return {
      stale: true,
      reason: `would_change count changed: expected ${input.expected_would_change}, got ${input.actual_would_change}`,
    };
  }
  return { stale: false };
}

export function computeDryRunCandidate(row: {
  id: string;
  source: string | null;
  overrides: Record<string, unknown> | null;
}): DryRunCandidate {
  const raw = row.overrides ?? {};
  const { overrides: normalized, warnings } = normalizeOverrides(raw);

  const currentVersion =
    typeof raw['overrides_version'] === 'string' && raw['overrides_version']
      ? (raw['overrides_version'] as string)
      : null;

  const change_keys: DryRunChangeKey[] = [];

  if (currentVersion !== OVERRIDES_VERSION) {
    change_keys.push('add_overrides_version');
  }
  if ('estimatedBudget' in raw) {
    change_keys.push('remove_estimatedBudget');
  }
  if ('trendLevel' in raw) {
    change_keys.push('remove_trendLevel');
  }
  if ('hasScript' in raw && !('hasScript' in normalized)) {
    change_keys.push('remove_hasScript');
  }

  return {
    id: row.id,
    source: row.source,
    would_change: change_keys.length > 0,
    current_overrides_version: currentVersion,
    next_overrides_version: OVERRIDES_VERSION,
    change_keys,
    warnings,
  };
}

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
