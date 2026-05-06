/**
 * Helpers for creating and updating ingest_runs rows.
 * All operations are non-fatal: a failed DB write never blocks the ingest flow.
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
  status?: IngestRunStatus;
  stage?: IngestRunStage | null;
  result?: Record<string, unknown>;
  warnings?: unknown[];
  error_code?: string | null;
  error_message?: string | null;
  started_at?: string | null;
  finished_at?: string | null;
  concept_id?: string | null;
  hagen_video_id?: string | null;
  hagen_request_id?: string | null;
  hagen_contract_version?: string | null;
}

export async function updateIngestRun(id: string, patch: IngestRunPatch): Promise<void> {
  try {
    const supabase = createSupabaseAdmin();
    const { error } = await supabase
      .from('ingest_runs')
      .update({ ...patch, updated_at: new Date().toISOString() })
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
