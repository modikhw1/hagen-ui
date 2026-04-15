/**
 * Motor signal helpers.
 *
 * Two persistence layers:
 *
 * 1. customer_profiles columns (legacy, still written for backward compat):
 *    pending_history_advance              SMALLINT NULL    — evidence count
 *    pending_history_advance_seen_at      TIMESTAMPTZ NULL — acknowledgement
 *    pending_history_advance_published_at TIMESTAMPTZ NULL — freshness seam
 *
 * 2. feed_motor_signals table (new, durable):
 *    Rows are never deleted — instead auto_resolved_at and acknowledged_at
 *    track the lifecycle so CM can see historical signals.
 *
 * Signal states (feed_motor_signals):
 *   acknowledged_at IS NULL AND auto_resolved_at IS NULL  → active nudge (show to CM)
 *   auto_resolved_at IS NOT NULL                          → auto-resolved (subtle badge)
 *   acknowledged_at IS NOT NULL                           → CM acknowledged / dismissed
 */

import { createSupabaseAdmin } from '@/lib/server/supabase-admin';

type SupabaseAdmin = ReturnType<typeof createSupabaseAdmin>;

// ── Classification ──────────────────────────────────────────────────────────

/**
 * Semantic interpretation of a pending motor signal.
 *   fresh_activity — recent TikTok content; advancing the plan is likely meaningful.
 *   backfill       — old content (historical import); CM should verify before advancing.
 */
export type MotorSignalKind = 'fresh_activity' | 'backfill';

/** Clips published within this many days are considered fresh activity. */
const FRESH_ACTIVITY_THRESHOLD_DAYS = 90;

/**
 * Derives the semantic classification of a pending motor signal.
 * Returns null when there is no pending signal.
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

// ── Column-based write helpers (customer_profiles) ──────────────────────────

/** Fields to write when new imported_history rows arrive.
 * @deprecated Still written for backward compat; migrate reads to feed_motor_signals.
 */
export function motorSignalNewEvidence(importedCount: number, latestPublishedAt: string | null) {
  return {
    pending_history_advance: importedCount,
    // DEPRECATED: migrate to feed_motor_signals acknowledged_at
    pending_history_advance_seen_at: null,
    pending_history_advance_published_at: latestPublishedAt,
  } as const;
}

/** Fields to write when the CM advances the plan. Clears evidence, acknowledgement, and freshness seam.
 * @deprecated Still written for backward compat; migrate reads to feed_motor_signals.
 */
export function motorSignalCleared() {
  return {
    pending_history_advance: null,
    // DEPRECATED: migrate to feed_motor_signals acknowledged_at
    pending_history_advance_seen_at: null,
    pending_history_advance_published_at: null,
  } as const;
}

// ── feed_motor_signals table helpers ────────────────────────────────────────

export interface FeedMotorSignalPayload {
  imported_count?: number;
  latest_published_at?: string | null;
  kind?: MotorSignalKind;
  [key: string]: unknown;
}

/**
 * Creates a new nudge row in feed_motor_signals for the customer.
 * Only inserts if there is no existing unacknowledged, unresolved nudge.
 *
 * @returns The created signal id, or null if skipped (existing active nudge).
 */
export async function createMotorSignalNudge(
  supabase: SupabaseAdmin,
  customerId: string,
  payload: FeedMotorSignalPayload
): Promise<string | null> {
  // Check for existing active (unacknowledged + unresolved) nudge
  const { data: existing } = await supabase
    .from('feed_motor_signals')
    .select('id')
    .eq('customer_id', customerId)
    .eq('signal_type', 'nudge')
    .is('acknowledged_at', null)
    .is('auto_resolved_at', null)
    .limit(1)
    .maybeSingle();

  if (existing) {
    // Active nudge already exists — skip to avoid duplicates
    return null;
  }

  const { data: inserted, error } = await supabase
    .from('feed_motor_signals')
    .insert({
      customer_id: customerId,
      signal_type: 'nudge',
      payload,
    })
    .select('id')
    .single();

  if (error) {
    console.error('[motor-signal] failed to insert nudge:', error.message);
    return null;
  }

  return inserted?.id ?? null;
}

/**
 * Marks all active nudges for a customer as auto-resolved.
 * Called by auto-reconcile when it successfully advances the plan.
 */
export async function autoResolveMotorSignals(
  supabase: SupabaseAdmin,
  customerId: string,
  resolvedAt: string
): Promise<void> {
  await supabase
    .from('feed_motor_signals')
    .update({ auto_resolved_at: resolvedAt })
    .eq('customer_id', customerId)
    .is('acknowledged_at', null)
    .is('auto_resolved_at', null);
}

/**
 * Acknowledges a specific nudge signal (CM clicked "Bekräfta").
 */
export async function acknowledgeMotorSignal(
  supabase: SupabaseAdmin,
  signalId: string,
  acknowledgedAt: string
): Promise<void> {
  await supabase
    .from('feed_motor_signals')
    .update({ acknowledged_at: acknowledgedAt })
    .eq('id', signalId);
}
