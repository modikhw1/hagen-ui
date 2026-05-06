// ─────────────────────────────────────────────────────────────────────────────
// reconciliation-candidates.ts
//
// Service functions for feed_reconciliation_candidates lifecycle management.
//
// Design rules:
//   - generateReconciliationCandidates throws on any required DB error so that
//     locked (decided) pairs are never at risk of being overwritten.
//   - markCandidateAcceptedForLink returns a MarkResult so callers can decide
//     whether a failure is fatal (accept route → 500) or advisory (sync → log).
//     It never throws.
//   - resetCandidateAfterUndo is best-effort: it logs failures and never throws.
// ─────────────────────────────────────────────────────────────────────────────

import { logger } from '../logger.js';
import { rankCandidates } from './reconciliation-scoring.js';
import { createSupabaseAdmin } from '../supabase.js';

type SupabaseAdmin = ReturnType<typeof createSupabaseAdmin>;

export interface GenerateResult {
  generated: number;
  skipped_locked: number;
  history_count: number;
}

export interface MarkResult {
  ok: boolean;
  /** True when a new candidate row was inserted (didn't exist before). */
  inserted: boolean;
  /** True when an existing candidate row was updated. */
  updated: boolean;
  /** Number of competing 'suggested' candidates rejected. */
  rejected: number;
  /** Set when any DB operation failed. */
  error?: string;
}

/**
 * Generates (or refreshes) reconciliation candidate rows for a single customer.
 *
 * Scores every unreconciled history_import row against every active
 * assignment/collaboration row, upserts the eligible pairs as 'suggested',
 * and skips any pair already decided (accepted/rejected/auto_accepted).
 *
 * All required DB queries are error-checked and throw on failure — this ensures
 * that locked (decided) pairs are never at risk of being overwritten when
 * a query fails silently.
 *
 * @throws if any required DB query fails.
 */
export async function generateReconciliationCandidates(
  supabase: SupabaseAdmin,
  customerId: string,
): Promise<GenerateResult> {
  // 1. Unreconciled history rows (row_kind='history_import', no existing link)
  const { data: historyRows, error: histErr } = await supabase
    .from('customer_concepts')
    .select('id, published_at, tiktok_url, feed_order')
    .eq('customer_profile_id', customerId)
    .eq('row_kind', 'history_import')
    .is('reconciled_customer_concept_id', null)
    .not('tiktok_url', 'is', null);

  if (histErr) throw new Error(`generate: history query failed: ${histErr.message}`);

  const history = (historyRows ?? []) as Array<{
    id: string; published_at: string | null; tiktok_url: string | null; feed_order: number | null;
  }>;

  if (history.length === 0) return { generated: 0, skipped_locked: 0, history_count: 0 };

  // 2. Target rows: assignment or collaboration rows, not archived
  const { data: targetRows, error: tgtErr } = await supabase
    .from('customer_concepts')
    .select('id, feed_order, planned_publish_at')
    .eq('customer_profile_id', customerId)
    .in('row_kind', ['assignment', 'collaboration'])
    .not('concept_id', 'is', null)
    .neq('status', 'archived');

  if (tgtErr) throw new Error(`generate: target query failed: ${tgtErr.message}`);

  // 3. Which targets are already linked by another history row?
  const { data: existingLinks, error: linksErr } = await supabase
    .from('customer_concepts')
    .select('reconciled_customer_concept_id')
    .eq('customer_profile_id', customerId)
    .not('reconciled_customer_concept_id', 'is', null);

  if (linksErr) throw new Error(`generate: existing-links query failed: ${linksErr.message}`);

  const reconciledTargetIds = new Set(
    ((existingLinks ?? []) as Array<{ reconciled_customer_concept_id: string }>)
      .map((r) => r.reconciled_customer_concept_id),
  );

  const targets = ((targetRows ?? []) as Array<{
    id: string; feed_order: number | null; planned_publish_at: string | null;
  }>).map((t) => ({
    ...t,
    is_already_reconciled: reconciledTargetIds.has(t.id),
  }));

  // 4. Which (history, target) pairs are already decided? Don't overwrite them.
  //    This query MUST succeed — if it fails we throw rather than risk overwriting
  //    accepted/rejected/auto_accepted rows with 'suggested'.
  const { data: lockedRows, error: lockedErr } = await supabase
    .from('feed_reconciliation_candidates')
    .select('history_concept_id, target_customer_concept_id')
    .eq('customer_id', customerId)
    .in('status', ['accepted', 'rejected', 'auto_accepted']);

  if (lockedErr) throw new Error(`generate: locked-pairs query failed: ${lockedErr.message}`);

  const lockedPairs = new Set(
    ((lockedRows ?? []) as Array<{ history_concept_id: string; target_customer_concept_id: string }>)
      .map((r) => `${r.history_concept_id}:${r.target_customer_concept_id}`),
  );

  // 5. Score all pairs and collect upsert rows (skipping locked pairs)
  const toUpsert: Array<{
    customer_id: string;
    history_concept_id: string;
    target_customer_concept_id: string;
    score: number;
    reasons: string[];
    status: string;
  }> = [];

  for (const hist of history) {
    const ranked = rankCandidates(hist, targets);
    for (const { target, result } of ranked) {
      if (lockedPairs.has(`${hist.id}:${target.id}`)) continue;
      toUpsert.push({
        customer_id: customerId,
        history_concept_id: hist.id,
        target_customer_concept_id: target.id,
        score: result.score,
        reasons: result.reasons,
        status: 'suggested',
      });
    }
  }

  if (toUpsert.length === 0) {
    return { generated: 0, skipped_locked: lockedPairs.size, history_count: history.length };
  }

  // 6. Upsert — on conflict (history_concept_id, target_customer_concept_id) refresh score/reasons.
  //    Locked pairs were excluded above so this will never overwrite decided rows.
  const { error: upsertErr } = await supabase
    .from('feed_reconciliation_candidates')
    .upsert(toUpsert, {
      onConflict: 'history_concept_id,target_customer_concept_id',
      ignoreDuplicates: false,
    });

  if (upsertErr) throw new Error(`generate: upsert failed: ${upsertErr.message}`);

  logger.info(
    { customerId, generated: toUpsert.length, skipped_locked: lockedPairs.size, history_count: history.length },
    'reconciliation-candidates: generate complete',
  );

  return { generated: toUpsert.length, skipped_locked: lockedPairs.size, history_count: history.length };
}

/**
 * After a reconciliation link is established (CM or auto), marks the matching
 * candidate as 'accepted' or 'auto_accepted' and rejects all other 'suggested'
 * candidates for the same history row.
 *
 * Uses UPDATE-then-INSERT to preserve the existing score when the candidate was
 * previously generated. If no candidate exists, inserts a new row with score=0.
 *
 * Returns a MarkResult describing what happened. Never throws — callers decide
 * whether ok=false is fatal (accept endpoint) or advisory (tiktok-sync).
 */
export async function markCandidateAcceptedForLink(
  supabase: SupabaseAdmin,
  historyConceptId: string,
  targetConceptId: string,
  opts: {
    customerId: string;
    actorId: string | null;
    now: string;
    /** When true, writes 'auto_accepted' (system link). Defaults to false (CM action). */
    auto?: boolean;
  },
): Promise<MarkResult> {
  const status = opts.auto ? 'auto_accepted' : 'accepted';
  let inserted = false;
  let updated = false;
  let rejected = 0;

  try {
    // Try to update an existing row — preserves the generated score.
    const { data: updatedRows, error: updateErr } = await supabase
      .from('feed_reconciliation_candidates')
      .update({ status, decided_at: opts.now, decided_by: opts.actorId ?? null })
      .eq('history_concept_id', historyConceptId)
      .eq('target_customer_concept_id', targetConceptId)
      .select('id');

    if (updateErr) {
      logger.warn({ err: updateErr, historyConceptId }, 'markCandidateAcceptedForLink: update failed');
      return { ok: false, inserted: false, updated: false, rejected: 0, error: updateErr.message };
    }

    if (updatedRows && updatedRows.length > 0) {
      updated = true;
    } else {
      // Row didn't exist — insert it (score=0; the link itself is the source of truth).
      const { error: insertErr } = await supabase
        .from('feed_reconciliation_candidates')
        .insert({
          customer_id: opts.customerId,
          history_concept_id: historyConceptId,
          target_customer_concept_id: targetConceptId,
          score: 0,
          reasons: [],
          status,
          decided_at: opts.now,
          decided_by: opts.actorId ?? null,
        });
      if (insertErr) {
        logger.warn({ err: insertErr, historyConceptId }, 'markCandidateAcceptedForLink: insert failed');
        return { ok: false, inserted: false, updated: false, rejected: 0, error: insertErr.message };
      }
      inserted = true;
    }

    // Reject all other suggested candidates competing for the same history row.
    const { data: rejectedRows, error: rejectErr } = await supabase
      .from('feed_reconciliation_candidates')
      .update({ status: 'rejected', decided_at: opts.now, decided_by: opts.actorId ?? null })
      .eq('history_concept_id', historyConceptId)
      .eq('status', 'suggested')
      .neq('target_customer_concept_id', targetConceptId)
      .select('id');

    if (rejectErr) {
      // The primary accept succeeded — log this as a warning but still return ok=true.
      // Competitor rows remain 'suggested' and will be auto-cleaned on next generate.
      logger.warn({ err: rejectErr, historyConceptId }, 'markCandidateAcceptedForLink: reject-others failed');
    } else {
      rejected = rejectedRows?.length ?? 0;
    }

    return { ok: true, inserted, updated, rejected };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn({ err, historyConceptId }, 'markCandidateAcceptedForLink: unexpected error');
    return { ok: false, inserted: false, updated: false, rejected: 0, error: msg };
  }
}

/**
 * After a reconciliation link is undone (DELETE /history/reconciliation), resets
 * the accepted/auto_accepted candidate back to 'suggested' so the CM can re-decide.
 *
 * Best-effort: logs failures but never throws.
 */
export async function resetCandidateAfterUndo(
  supabase: SupabaseAdmin,
  historyConceptId: string,
  targetConceptId: string,
): Promise<void> {
  try {
    const { error } = await supabase
      .from('feed_reconciliation_candidates')
      .update({ status: 'suggested', decided_at: null, decided_by: null })
      .eq('history_concept_id', historyConceptId)
      .eq('target_customer_concept_id', targetConceptId)
      .in('status', ['accepted', 'auto_accepted']);

    if (error) {
      logger.warn({ err: error, historyConceptId, targetConceptId }, 'resetCandidateAfterUndo: update failed');
    }
  } catch (err) {
    logger.warn({ err, historyConceptId }, 'resetCandidateAfterUndo: unexpected error');
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Backfill
// ─────────────────────────────────────────────────────────────────────────────

export interface BackfillOptions {
  /** When true, identifies eligible customers but runs no DB writes. */
  dryRun?: boolean;
  /** Cap the number of eligible customers processed (for incremental runs). */
  limit?: number;
  /** Restrict processing to specific customer IDs. */
  customerIds?: string[];
}

export interface BackfillResult {
  customers_processed: number;
  generated: number;
  skipped_locked: number;
  history_count: number;
  errors: Array<{ customerId: string; error: string }>;
  dry_run: boolean;
  /**
   * Number of customers with at least one unreconciled history_import row
   * (tiktok_url IS NOT NULL). This is the raw history universe before the
   * target-availability filter is applied.
   */
  customers_with_history: number;
  /**
   * Number of customers that are actually processable: they have at least one
   * unreconciled history row AND at least one eligible target row
   * (row_kind IN ('assignment','collaboration'), concept_id IS NOT NULL, status != 'archived').
   * This is the count used for limit and customerIds filtering.
   */
  eligible_count: number;
}

/**
 * Finds customers with unreconciled history_import rows AND at least one
 * eligible target row, then runs generateReconciliationCandidates for each
 * one sequentially.
 *
 * Eligible criteria (both must hold):
 *   - At least one customer_concepts row with row_kind='history_import',
 *     reconciled_customer_concept_id IS NULL, tiktok_url IS NOT NULL
 *   - At least one customer_concepts row with row_kind IN ('assignment','collaboration'),
 *     concept_id IS NOT NULL, status != 'archived'
 *
 * In dryRun mode: classifies customers and returns counts without any DB writes.
 *
 * @throws if the initial customer discovery queries fail.
 */
export async function backfillReconciliationCandidates(
  supabase: SupabaseAdmin,
  opts: BackfillOptions = {},
): Promise<BackfillResult> {
  // Step A: customers with at least one unreconciled history_import row
  const { data: historyCustomers, error: discoverErr } = await supabase
    .from('customer_concepts')
    .select('customer_profile_id')
    .eq('row_kind', 'history_import')
    .is('reconciled_customer_concept_id', null)
    .not('tiktok_url', 'is', null);

  if (discoverErr) throw new Error(`backfill: customer discovery failed: ${discoverErr.message}`);

  const idsWithHistory = [...new Set(
    ((historyCustomers ?? []) as Array<{ customer_profile_id: string }>)
      .map((r) => r.customer_profile_id),
  )];

  const customersWithHistory = idsWithHistory.length;

  if (customersWithHistory === 0) {
    return {
      customers_processed: 0, generated: 0, skipped_locked: 0, history_count: 0,
      errors: [], dry_run: opts.dryRun ?? false,
      customers_with_history: 0, eligible_count: 0,
    };
  }

  // Step B: of those, which also have at least one eligible target row?
  const { data: targetCustomers, error: targetErr } = await supabase
    .from('customer_concepts')
    .select('customer_profile_id')
    .in('customer_profile_id', idsWithHistory)
    .in('row_kind', ['assignment', 'collaboration'])
    .not('concept_id', 'is', null)
    .neq('status', 'archived');

  if (targetErr) throw new Error(`backfill: target discovery failed: ${targetErr.message}`);

  const idsWithTargets = new Set(
    ((targetCustomers ?? []) as Array<{ customer_profile_id: string }>)
      .map((r) => r.customer_profile_id),
  );

  // Eligible = has both history rows AND target rows
  let eligibleIds = idsWithHistory.filter((id) => idsWithTargets.has(id));

  // Apply customerIds filter if requested
  if (opts.customerIds && opts.customerIds.length > 0) {
    eligibleIds = eligibleIds.filter((id) => opts.customerIds!.includes(id));
  }

  const eligibleCount = eligibleIds.length;

  // Apply limit
  const processList = opts.limit != null ? eligibleIds.slice(0, opts.limit) : eligibleIds;

  if (opts.dryRun) {
    logger.info(
      { customers_with_history: customersWithHistory, eligible_count: eligibleCount, dryRun: true },
      'backfill-reconciliation-candidates: dry run complete',
    );
    return {
      customers_processed: 0,
      generated: 0,
      skipped_locked: 0,
      history_count: 0,
      errors: [],
      dry_run: true,
      customers_with_history: customersWithHistory,
      eligible_count: eligibleCount,
    };
  }

  let totalGenerated = 0;
  let totalSkippedLocked = 0;
  let totalHistoryCount = 0;
  let totalProcessed = 0;
  const errors: Array<{ customerId: string; error: string }> = [];

  for (const customerId of processList) {
    try {
      const result = await generateReconciliationCandidates(supabase, customerId);
      totalGenerated += result.generated;
      totalSkippedLocked += result.skipped_locked;
      totalHistoryCount += result.history_count;
      totalProcessed++;
      logger.info({ customerId, ...result }, 'backfill: customer complete');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.warn({ err, customerId }, 'backfill: customer failed (continuing)');
      errors.push({ customerId, error: msg });
    }
  }

  logger.info(
    { totalProcessed, totalGenerated, totalSkippedLocked, totalHistoryCount, errors: errors.length, customers_with_history: customersWithHistory, eligible_count: eligibleCount },
    'backfill-reconciliation-candidates: complete',
  );

  return {
    customers_processed: totalProcessed,
    generated: totalGenerated,
    skipped_locked: totalSkippedLocked,
    history_count: totalHistoryCount,
    errors,
    dry_run: false,
    customers_with_history: customersWithHistory,
    eligible_count: eligibleCount,
  };
}
