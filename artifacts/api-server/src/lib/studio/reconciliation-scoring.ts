// ─────────────────────────────────────────────────────────────────────────────
// reconciliation-scoring.ts
//
// Pure scoring helper for feed_reconciliation_candidates.
//
// Given one imported TikTok history row and one target LeTrend assignment row,
// computes a 0-100 confidence score and a list of human-readable reasons.
//
// Design rules:
//   - No Supabase calls. All inputs are plain objects supplied by the caller.
//   - No side effects. The function is pure and deterministic for given inputs.
//   - "Already reconciled" targets are always ineligible (score=0, eligible=false).
//   - A missing published_at on the history row makes all date scoring unavailable,
//     capping the maximum achievable score at 40.
//
// Scoring breakdown (maximum 100):
//   +40  current_slot         — target is the nu-slot (feed_order=0)
//   +40  date_proximity_high  — published_at within ±3 days of planned_publish_at
//   +25  date_proximity_medium — published_at within ±7 days
//   +10  date_proximity_low   — published_at within ±14 days
//    +5  feed_order_adjacent  — history feed_order is adjacent to target feed_order
//    0   no_published_at      — no date signal available; date score treated as 0
//    0   no_planned_date      — target has no planned_publish_at; date score treated as 0
//   =0   already_reconciled   — target already linked; score forced to 0, eligible=false
// ─────────────────────────────────────────────────────────────────────────────

export interface HistoryConceptForScoring {
  /** UUID of the imported_history customer_concepts row. */
  id: string;
  /** Actual TikTok publish date from the API. Null if not available. */
  published_at: string | null;
  /** TikTok URL — presence used as a sanity check but not scored. */
  tiktok_url: string | null;
  /** feed_order on the history row (usually negative). Null if unset. */
  feed_order: number | null;
}

export interface TargetConceptForScoring {
  /** UUID of the assignment/collaboration customer_concepts row. */
  id: string;
  /** 0 = current (nu-slot), >0 = upcoming, <0 = past. Null if unplaced. */
  feed_order: number | null;
  /** Planned publish date set by the CM. Null if not yet planned. */
  planned_publish_at: string | null;
  /**
   * True when another history row already has reconciled_customer_concept_id = this id.
   * The caller must compute this from the DB before calling scoreCandidate.
   */
  is_already_reconciled: boolean;
}

export type ScoringReason =
  | 'current_slot'           // target is the nu-slot (feed_order === 0)
  | 'date_proximity_high'    // published_at within ±3 days of planned_publish_at
  | 'date_proximity_medium'  // published_at within ±7 days of planned_publish_at
  | 'date_proximity_low'     // published_at within ±14 days of planned_publish_at
  | 'feed_order_adjacent'    // |history.feed_order - target.feed_order| <= 1
  | 'no_published_at'        // history row has no published_at — date signals unavailable
  | 'no_planned_date'        // target has no planned_publish_at — date signals unavailable
  | 'already_reconciled';    // target already linked — ineligible

export interface ScoringResult {
  /** 0-100 composite confidence score. */
  score: number;
  /** Ordered list of reasons that contributed to (or limited) the score. */
  reasons: ScoringReason[];
  /** False when the target is ineligible (already_reconciled or score === 0). */
  eligible: boolean;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function daysBetween(a: string, b: string): number {
  return Math.abs(new Date(a).getTime() - new Date(b).getTime()) / MS_PER_DAY;
}

/**
 * Scores one (history row, target assignment row) pair.
 *
 * @param history - The imported TikTok history row to be linked.
 * @param target  - The LeTrend assignment/collaboration row to link it to.
 * @returns ScoringResult with a 0-100 score, reasons, and eligibility flag.
 */
export function scoreCandidate(
  history: HistoryConceptForScoring,
  target: TargetConceptForScoring,
): ScoringResult {
  const reasons: ScoringReason[] = [];

  // ── Hard exclusion ──────────────────────────────────────────────────────────
  if (target.is_already_reconciled) {
    reasons.push('already_reconciled');
    return { score: 0, reasons, eligible: false };
  }

  let score = 0;

  // ── Current slot bonus ──────────────────────────────────────────────────────
  if (target.feed_order === 0) {
    score += 40;
    reasons.push('current_slot');
  }

  // ── Date proximity ──────────────────────────────────────────────────────────
  if (!history.published_at) {
    reasons.push('no_published_at');
    // No date bonus possible — continue to other signals
  } else if (!target.planned_publish_at) {
    reasons.push('no_planned_date');
    // No date bonus possible
  } else {
    const days = daysBetween(history.published_at, target.planned_publish_at);
    if (days <= 3) {
      score += 40;
      reasons.push('date_proximity_high');
    } else if (days <= 7) {
      score += 25;
      reasons.push('date_proximity_medium');
    } else if (days <= 14) {
      score += 10;
      reasons.push('date_proximity_low');
    }
    // >14 days: no date bonus, no reason added
  }

  // ── feed_order adjacency ────────────────────────────────────────────────────
  if (
    history.feed_order !== null &&
    target.feed_order !== null &&
    Math.abs(history.feed_order - target.feed_order) <= 1
  ) {
    score += 5;
    reasons.push('feed_order_adjacent');
  }

  // Cap at 100 (shouldn't happen with current weights but keeps contract stable)
  score = Math.min(100, score);

  return { score, reasons, eligible: score > 0 };
}

/**
 * Generates scored candidates for a single history row against multiple target rows.
 * Returns only eligible candidates, sorted by score descending.
 *
 * @param history - The imported TikTok history row to match.
 * @param targets - All potential assignment/collaboration rows for this customer.
 * @returns Scored, eligible candidates sorted by score descending.
 */
export function rankCandidates(
  history: HistoryConceptForScoring,
  targets: TargetConceptForScoring[],
): Array<{ target: TargetConceptForScoring; result: ScoringResult }> {
  return targets
    .map((target) => ({ target, result: scoreCandidate(history, target) }))
    .filter(({ result }) => result.eligible)
    .sort((a, b) => b.result.score - a.result.score);
}
