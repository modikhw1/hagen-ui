/**
 * Motor signal helpers for customer_profiles.
 *
 * Three fields encode the profile-driven state motor:
 *   pending_history_advance              SMALLINT NULL    — evidence count (non-null = new clips arrived)
 *   pending_history_advance_seen_at      TIMESTAMPTZ NULL — acknowledgement (non-null = CM dismissed without advancing)
 *   pending_history_advance_published_at TIMESTAMPTZ NULL — freshness seam: MAX(published_at) of triggering batch
 *
 * Three distinct states:
 *   pending_history_advance IS NULL                       → nothing pending
 *   pending_history_advance IS NOT NULL, seen_at IS NULL  → evidence arrived, unacknowledged → show nudge
 *   pending_history_advance IS NOT NULL, seen_at IS NOT NULL → CM acknowledged, not yet advanced → suppress nudge
 *
 * Rules:
 *   New external evidence → motorSignalNewEvidence(count, latestPublishedAt)  writes all three fields
 *   CM acknowledges/dismisses → set seen_at = NOW() only    (handled in profile PATCH, not here)
 *   CM advances plan  → motorSignalCleared()                clears all three fields
 *
 * Freshness seam:
 *   pending_history_advance_published_at = MAX(published_at) of newly imported clips in the triggering batch.
 *   Distinguishes fresh batches (recent published_at) from backfill imports (old published_at) without an extra
 *   DB read. Cleared on advance alongside the other two fields. Never touched by acknowledge/dismiss.
 *
 * Signal classification:
 *   classifyMotorSignal() derives 'fresh_activity' | 'backfill' from the freshness seam at read-time.
 *   Derived (not persisted) so the label always reflects the current clock — a persisted label would
 *   grow stale if the CM never advances. Available whenever pending_history_advance is non-null.
 */

// ── Classification ──────────────────────────────────────────────────────────

/**
 * Semantic interpretation of a pending motor signal.
 *   fresh_activity — the triggering batch contained recently published TikTok content.
 *                    Advancing the plan is likely meaningful.
 *   backfill       — the triggering batch contained old content (historical import).
 *                    Advancing may be premature; the CM should verify.
 */
export type MotorSignalKind = 'fresh_activity' | 'backfill';

/**
 * Clips published within this many days of now are considered fresh activity.
 * Older clips are classified as backfill (historical import).
 */
const FRESH_ACTIVITY_THRESHOLD_DAYS = 90;

/**
 * Derives the semantic classification of the current pending motor signal.
 *
 * Returns null when there is no pending signal (pending_history_advance is null/falsy).
 * Returns 'fresh_activity' when pending_history_advance_published_at is within
 * FRESH_ACTIVITY_THRESHOLD_DAYS of now, or when the published_at is unknown (null).
 * Returns 'backfill' when the newest clip in the triggering batch was published
 * more than FRESH_ACTIVITY_THRESHOLD_DAYS ago.
 *
 * Rule for null published_at: conservative default to 'fresh_activity' — better to
 * surface a potentially real signal than to silently suppress it.
 */
export function classifyMotorSignal(profile: {
  pending_history_advance?: number | null;
  pending_history_advance_published_at?: string | null;
}): MotorSignalKind | null {
  if (!profile.pending_history_advance) return null;

  const publishedAt = profile.pending_history_advance_published_at;
  if (!publishedAt) return 'fresh_activity'; // unknown date → conservative

  const ageMs = Date.now() - new Date(publishedAt).getTime();
  const ageDays = ageMs / (1000 * 60 * 60 * 24);
  return ageDays <= FRESH_ACTIVITY_THRESHOLD_DAYS ? 'fresh_activity' : 'backfill';
}

// ── Write helpers ────────────────────────────────────────────────────────────

/** Fields to write when new imported_history rows arrive. */
export function motorSignalNewEvidence(importedCount: number, latestPublishedAt: string | null) {
  return {
    pending_history_advance: importedCount,
    pending_history_advance_seen_at: null,
    pending_history_advance_published_at: latestPublishedAt,
  } as const;
}

/** Fields to write when the CM advances the plan. Clears evidence, acknowledgement, and freshness seam. */
export function motorSignalCleared() {
  return {
    pending_history_advance: null,
    pending_history_advance_seen_at: null,
    pending_history_advance_published_at: null,
  } as const;
}
