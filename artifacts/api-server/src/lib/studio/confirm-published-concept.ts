// ─────────────────────────────────────────────────────────────────────────────
// confirm-published-concept.ts
//
// Unified service layer for linking a TikTok-imported history row to a LeTrend
// assignment card ("confirmation"), and for undoing that link.
//
// Design rules:
//   - confirmPublishedConcept never performs a timeline advance. Advance logic
//     lives in mark-produced (EP-4) and autoReconcileAndAdvance (EP-6).
//   - Stats propagation (thumbnail, url, views, likes, comments, published_at)
//     is always attempted and failures are treated as non-fatal warnings.
//   - Candidate-status updates are non-fatal by default. Callers that need
//     fatality (e.g. candidate accept endpoint) should check result.candidateUpdated
//     and respond accordingly.
//   - undoConfirmedConcept deliberately does NOT attempt to reverse any timeline
//     advance — advance is irreversible by design.
//
// Covered entrypoints (Phase 8a):
//   EP-1  POST /reconciliation-candidates/:candidateId/accept
//   EP-2  POST /history/reconciliation
//   EP-3  DELETE /history/reconciliation
//
// Not yet covered (later phases):
//   EP-5  tiktok-sync.ts inline auto-reconcile
//   EP-6  autoReconcileAndAdvance
// ─────────────────────────────────────────────────────────────────────────────

import { logger } from '../logger.js';
import {
  markCandidateAcceptedForLink,
  resetCandidateAfterUndo,
} from './reconciliation-candidates.js';
import { createSupabaseAdmin } from '../supabase.js';

type SupabaseAdmin = ReturnType<typeof createSupabaseAdmin>;

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type ConfirmSource =
  | 'candidate_accept'       // EP-1: CM accepts a suggested candidate
  | 'history_use_now_slot'   // EP-2 mode=use_now_slot
  | 'history_manual'         // EP-2 mode=manual
  | 'auto_sync'              // EP-5: tiktok-sync auto-link (no advance)
  | 'auto_sync_advance'      // EP-6: autoReconcileAndAdvance (always advances)
  | 'mark_produced_dialog';  // EP-10: MarkProducedDialog picker

export interface ConfirmPublishedConceptInput {
  supabase: SupabaseAdmin;
  customerId: string;
  /** The imported_history row (concept_id IS NULL) to link FROM. */
  historyConceptId: string;
  /** The assignment row (concept_id IS NOT NULL) to link TO. */
  targetCustomerConceptId: string;
  /** CM who performed the action; null for system-initiated links. */
  actorId: string | null;
  source: ConfirmSource;
  /** ISO timestamp — caller is responsible for supplying a consistent value. */
  now: string;
}

export interface ConfirmPublishedConceptResult {
  linked: boolean;
  /** True when markCandidateAcceptedForLink reported ok=true. */
  candidateUpdated: boolean;
  /** Non-fatal warnings (logged; do not fail the operation). */
  warnings: string[];
  /** Set only on a fatal error — the link was not written. */
  error?: string;
}

export interface UndoConfirmedConceptInput {
  supabase: SupabaseAdmin;
  /** The imported_history row whose link should be cleared. */
  historyConceptId: string;
  /** The customer who owns the row — used as a safety guard on the stats clear. */
  customerId: string;
  now: string;
}

export interface UndoConfirmedConceptResult {
  unlinked: boolean;
  /** True when resetCandidateAfterUndo ran without error. */
  candidateReset: boolean;
  warnings: string[];
  error?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// confirmPublishedConcept
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Links a TikTok-imported history row to a LeTrend assignment card and
 * propagates TikTok stats to the assignment card so it displays the thumbnail.
 *
 * Steps:
 *   1. Write the reconciliation link on the history row.
 *   2. Propagate stats (thumbnail, url, views, likes, comments, published_at)
 *      from the history row to the assignment row — non-fatal if it fails.
 *   3. Update candidate status via markCandidateAcceptedForLink — non-fatal.
 *
 * This function does NOT perform any timeline advance. Advance belongs in
 * mark-produced (EP-4) and autoReconcileAndAdvance (EP-6).
 */
export async function confirmPublishedConcept(
  input: ConfirmPublishedConceptInput,
): Promise<ConfirmPublishedConceptResult> {
  const { supabase, customerId, historyConceptId, targetCustomerConceptId, actorId, source, now } =
    input;
  const warnings: string[] = [];

  // ── Step 1: Write the reconciliation link ─────────────────────────────────
  const { error: linkErr } = await supabase
    .from('customer_concepts')
    .update({
      reconciled_customer_concept_id: targetCustomerConceptId,
      reconciled_by_cm_id: actorId ?? null,
      reconciled_at: now,
    })
    .eq('id', historyConceptId);

  if (linkErr) {
    logger.error(
      { err: linkErr, historyConceptId, targetCustomerConceptId, source },
      'confirmPublishedConcept: link write failed',
    );
    return { linked: false, candidateUpdated: false, warnings, error: linkErr.message };
  }

  // ── Step 2: Propagate TikTok stats to assignment row ─────────────────────
  const { data: histRow, error: fetchErr } = await supabase
    .from('customer_concepts')
    .select(
      'tiktok_thumbnail_url, tiktok_url, tiktok_views, tiktok_likes, tiktok_comments, published_at',
    )
    .eq('id', historyConceptId)
    .maybeSingle();

  if (fetchErr) {
    warnings.push(`stats-fetch: ${fetchErr.message}`);
  } else if (histRow) {
    const hr = histRow as Record<string, unknown>;
    const statsPatch: Record<string, unknown> = {};
    if (hr['tiktok_thumbnail_url']) statsPatch['tiktok_thumbnail_url'] = hr['tiktok_thumbnail_url'];
    if (hr['tiktok_url']) statsPatch['tiktok_url'] = hr['tiktok_url'];
    if (hr['tiktok_views'] != null) statsPatch['tiktok_views'] = hr['tiktok_views'];
    if (hr['tiktok_likes'] != null) statsPatch['tiktok_likes'] = hr['tiktok_likes'];
    if (hr['tiktok_comments'] != null) statsPatch['tiktok_comments'] = hr['tiktok_comments'];
    if (hr['published_at']) statsPatch['published_at'] = hr['published_at'];

    if (Object.keys(statsPatch).length > 0) {
      const { error: patchErr } = await supabase
        .from('customer_concepts')
        .update(statsPatch)
        .eq('id', targetCustomerConceptId);

      if (patchErr) {
        warnings.push(`stats-propagate: ${patchErr.message}`);
        logger.warn(
          { err: patchErr, historyConceptId, targetCustomerConceptId, source },
          'confirmPublishedConcept: stats propagation failed (non-fatal)',
        );
      }
    }
  }

  // ── Step 3: Update candidate status ───────────────────────────────────────
  const markResult = await markCandidateAcceptedForLink(
    supabase,
    historyConceptId,
    targetCustomerConceptId,
    { customerId, actorId, now, auto: actorId === null },
  );

  if (!markResult.ok && markResult.error) {
    warnings.push(`candidate-status: ${markResult.error}`);
  }

  logger.info(
    {
      historyConceptId,
      targetCustomerConceptId,
      source,
      actorId,
      candidateUpdated: markResult.ok,
      candidateInserted: markResult.inserted,
      candidateRejected: markResult.rejected,
      warnings: warnings.length,
    },
    'confirmPublishedConcept: complete',
  );

  return { linked: true, candidateUpdated: markResult.ok, warnings };
}

// ─────────────────────────────────────────────────────────────────────────────
// undoConfirmedConcept
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Clears the reconciliation link from a history row and removes the TikTok
 * stats overlay from the previously linked assignment card.
 *
 * Steps:
 *   1. Read the current reconciled_customer_concept_id (so we know which
 *      assignment row to clean up, even if the caller doesn't pass it).
 *   2. Clear reconciliation fields on the history row.
 *   3. Clear stats fields on the assignment row (guarded by customer_profile_id
 *      so this can never accidentally touch a row from a different customer).
 *   4. best-effort resetCandidateAfterUndo.
 *
 * This function deliberately does NOT reverse any timeline advance.
 * Advance is irreversible by design — adding a new assignment is the intended
 * recovery path.
 */
export async function undoConfirmedConcept(
  input: UndoConfirmedConceptInput,
): Promise<UndoConfirmedConceptResult> {
  const { supabase, historyConceptId, customerId, now: _now } = input;
  const warnings: string[] = [];

  // ── Step 1: Read current link ─────────────────────────────────────────────
  const { data: histRow, error: readErr } = await supabase
    .from('customer_concepts')
    .select('id, customer_profile_id, reconciled_customer_concept_id')
    .eq('id', historyConceptId)
    .maybeSingle();

  if (readErr) {
    return { unlinked: false, candidateReset: false, warnings, error: readErr.message };
  }
  if (!histRow) {
    return { unlinked: false, candidateReset: false, warnings, error: 'history row not found' };
  }

  const typedHist = histRow as {
    id: string;
    customer_profile_id: string;
    reconciled_customer_concept_id: string | null;
  };
  const assignmentId = typedHist.reconciled_customer_concept_id;

  // ── Step 2: Clear reconciliation fields on history row ────────────────────
  const { error: clearErr } = await supabase
    .from('customer_concepts')
    .update({
      reconciled_customer_concept_id: null,
      reconciled_by_cm_id: null,
      reconciled_at: null,
    })
    .eq('id', historyConceptId);

  if (clearErr) {
    logger.error(
      { err: clearErr, historyConceptId },
      'undoConfirmedConcept: link clear failed',
    );
    return { unlinked: false, candidateReset: false, warnings, error: clearErr.message };
  }

  // ── Step 3: Clear stats from assignment row ────────────────────────────────
  if (assignmentId) {
    const { error: undoPatchErr } = await supabase
      .from('customer_concepts')
      .update({
        tiktok_thumbnail_url: null,
        tiktok_url: null,
        tiktok_views: null,
        tiktok_likes: null,
        tiktok_comments: null,
        published_at: null,
      })
      // Guard: customer_profile_id ensures we never touch another customer's row
      .eq('id', assignmentId)
      .eq('customer_profile_id', customerId);

    if (undoPatchErr) {
      warnings.push(`stats-clear: ${undoPatchErr.message}`);
      logger.warn(
        { err: undoPatchErr, historyConceptId, assignmentId },
        'undoConfirmedConcept: stats clear failed (non-fatal)',
      );
    }
  }

  // ── Step 4: Reset candidate status (best-effort) ──────────────────────────
  let candidateReset = true;
  if (assignmentId) {
    try {
      await resetCandidateAfterUndo(supabase, historyConceptId, assignmentId);
    } catch (err) {
      candidateReset = false;
      const msg = err instanceof Error ? err.message : String(err);
      warnings.push(`candidate-reset: ${msg}`);
    }
  }

  logger.info(
    { historyConceptId, assignmentId, candidateReset, warnings: warnings.length },
    'undoConfirmedConcept: complete',
  );

  return { unlinked: true, candidateReset, warnings };
}
