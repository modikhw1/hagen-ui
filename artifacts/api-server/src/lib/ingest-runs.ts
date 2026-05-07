/**
 * Helpers for creating and updating ingest_runs rows.
 *
 * Design goals:
 *  - All operations are non-fatal: a failed DB write never blocks the ingest flow.
 *  - `result` JSONB uses merge semantics (patch.mergeResult is shallow-merged into
 *    the existing object, so analyze_summary / enrich_summary / humor_enrich can
 *    coexist in the same column across separate calls).
 *  - `warnings` JSONB array uses append semantics (patch.appendWarning is pushed
 *    onto the existing array, never replacing it).
 *
 * The read-modify-write for mergeResult/appendWarning is intentionally JS-side
 * rather than a Postgres RPC so no migration is required. Race conditions are
 * acceptable because: (a) api-server is single-process, (b) all writes are
 * non-fatal instrumentation, and (c) the window is a few milliseconds.
 */
import { createSupabaseAdmin } from './supabase.js';
import { logger } from './logger.js';

export type IngestRunStatus =
  | 'queued'
  | 'running'
  | 'ready_for_review'
  | 'completed'
  | 'failed'
  | 'canceled';

export type IngestRunStage =
  | 'analyzing'
  | 'enriching'
  | 'classifying'
  | 'saving'
  | 'humor_enriching';

export interface IngestRunPatch {
  // ── Scalar fields (written directly) ──────────────────────────────────────
  status?: IngestRunStatus;
  stage?: IngestRunStage | null;
  error_code?: string | null;
  error_message?: string | null;
  started_at?: string | null;
  finished_at?: string | null;
  concept_id?: string | null;
  hagen_video_id?: string | null;
  hagen_request_id?: string | null;
  hagen_contract_version?: string | null;

  // ── Merge/append fields (require read-modify-write) ───────────────────────
  /**
   * Shallow-merged into the existing `result` JSONB column.
   * Keys present in mergeResult overwrite matching keys in the existing object;
   * all other existing keys are preserved.
   *
   * Example: mergeResult: { analyze_summary: {...} }
   *   preserves existing result.enrich_summary, result.humor_enrich, etc.
   */
  mergeResult?: Record<string, unknown>;

  /**
   * Appended to the existing `warnings` JSONB array.
   * Never replaces earlier warnings.
   */
  appendWarning?: unknown;
}

// ── Pure helpers (exported for unit tests) ─────────────────────────────────

/** Merge a result patch into an existing result object. */
export function mergeResultInto(
  existing: Record<string, unknown>,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  return { ...existing, ...patch };
}

/** Append a warning to an existing warnings array. */
export function appendWarningTo(existing: unknown[], warning: unknown): unknown[] {
  return [...existing, warning];
}

// ── Main update helper ─────────────────────────────────────────────────────

export async function updateIngestRun(id: string, patch: IngestRunPatch): Promise<void> {
  try {
    const supabase = createSupabaseAdmin();
    const { mergeResult, appendWarning, ...scalars } = patch;

    const dbPatch: Record<string, unknown> = {
      ...scalars,
      updated_at: new Date().toISOString(),
    };

    // Merge/append paths require a read-modify-write.
    if (mergeResult !== undefined || appendWarning !== undefined) {
      const { data: current, error: fetchErr } = await supabase
        .from('ingest_runs')
        .select('result, warnings')
        .eq('id', id)
        .maybeSingle();

      if (fetchErr) {
        logger.warn(
          { err: fetchErr, ingestRunId: id },
          'ingest_runs fetch-for-merge failed (non-fatal) — writing scalars only',
        );
        // Fall through and write whatever scalars we have (mergeResult/appendWarning lost)
      } else if (current) {
        const row = current as { result?: unknown; warnings?: unknown };

        if (mergeResult !== undefined) {
          const existingResult =
            row.result && typeof row.result === 'object' && !Array.isArray(row.result)
              ? (row.result as Record<string, unknown>)
              : {};
          dbPatch['result'] = mergeResultInto(existingResult, mergeResult);
        }

        if (appendWarning !== undefined) {
          const existingWarnings = Array.isArray(row.warnings) ? row.warnings : [];
          dbPatch['warnings'] = appendWarningTo(existingWarnings, appendWarning);
        }
      }
    }

    const { error } = await supabase
      .from('ingest_runs')
      .update(dbPatch)
      .eq('id', id);

    if (error) {
      logger.warn({ err: error, ingestRunId: id }, 'ingest_runs update failed (non-fatal)');
    }
  } catch (err) {
    logger.warn({ err, ingestRunId: id }, 'ingest_runs update threw (non-fatal)');
  }
}

export function safeRunId(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}
