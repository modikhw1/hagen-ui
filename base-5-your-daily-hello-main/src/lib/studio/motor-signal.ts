/**
 * Motor signal helpers backed by feed_motor_signals.
 *
 * Signal states:
 *   acknowledged_at IS NULL AND auto_resolved_at IS NULL  → active nudge (show to CM)
 *   auto_resolved_at IS NOT NULL                          → auto-resolved (subtle badge)
 *   acknowledged_at IS NOT NULL                          → CM acknowledged / dismissed
 */

import { createSupabaseAdmin } from '@/lib/server/supabase-admin';
import { asJsonObject } from '@/lib/database/json';
import type { TablesInsert, TablesUpdate } from '@/types/database';

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

export function inferMotorSignalKind(publishedAt: string | null): MotorSignalKind {
  if (!publishedAt) return 'fresh_activity'; // unknown date → conservative

  const ageMs = Date.now() - new Date(publishedAt).getTime();
  const ageDays = ageMs / (1000 * 60 * 60 * 24);
  return ageDays <= FRESH_ACTIVITY_THRESHOLD_DAYS ? 'fresh_activity' : 'backfill';
}

/**
 * Loads the latest active nudge and returns its semantic kind.
 * Returns null when there is no active signal.
 */
export async function classifyMotorSignal(
  supabase: SupabaseAdmin,
  customerId: string
): Promise<MotorSignalKind | null> {
  const { data, error } = await supabase
    .from('feed_motor_signals')
    .select('payload')
    .eq('customer_id', customerId)
    .eq('signal_type', 'nudge')
    .is('acknowledged_at', null)
    .is('auto_resolved_at', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!data) return null;

  const payload = asJsonObject(data.payload) as FeedMotorSignalPayload;
  if (payload.kind === 'fresh_activity' || payload.kind === 'backfill') {
    return payload.kind;
  }

  return inferMotorSignalKind(
    typeof payload.latest_published_at === 'string' ? payload.latest_published_at : null
  );
}

// ── feed_motor_signals table helpers ────────────────────────────────────────

export interface FeedMotorSignalPayload {
  imported_count?: number;
  latest_published_at?: string | null;
  kind?: MotorSignalKind;
  [key: string]: import('@/types/database').Json | undefined;
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
  const importedCount =
    typeof payload.imported_count === 'number' && Number.isFinite(payload.imported_count)
      ? Math.max(0, Math.floor(payload.imported_count))
      : 0;
  const latestPublishedAt =
    typeof payload.latest_published_at === 'string' ? payload.latest_published_at : null;

  const { data: existing } = await supabase
    .from('feed_motor_signals')
    .select('id, payload')
    .eq('customer_id', customerId)
    .eq('signal_type', 'nudge')
    .is('acknowledged_at', null)
    .is('auto_resolved_at', null)
    .limit(1)
    .maybeSingle();

  if (existing) {
    const existingPayload = asJsonObject(existing.payload) as FeedMotorSignalPayload;
    const existingCount =
      typeof existingPayload.imported_count === 'number' && Number.isFinite(existingPayload.imported_count)
        ? Math.max(0, Math.floor(existingPayload.imported_count))
        : 0;
    const existingPublishedAt =
      typeof existingPayload.latest_published_at === 'string'
        ? existingPayload.latest_published_at
        : null;

    const mergedLatestPublishedAt =
      latestPublishedAt && existingPublishedAt
        ? (latestPublishedAt > existingPublishedAt ? latestPublishedAt : existingPublishedAt)
        : (latestPublishedAt ?? existingPublishedAt);

    const mergedPayload: FeedMotorSignalPayload = {
      ...existingPayload,
      ...payload,
      imported_count: existingCount + importedCount,
      latest_published_at: mergedLatestPublishedAt,
      kind: inferMotorSignalKind(mergedLatestPublishedAt),
    };

    const { error } = await supabase
      .from('feed_motor_signals')
      .update({ payload: mergedPayload } satisfies TablesUpdate<'feed_motor_signals'>)
      .eq('id', existing.id);

    if (error) {
      console.error('[motor-signal] failed to update active nudge:', error.message);
      return null;
    }

    return existing.id as string;
  }

  const nextPayload: FeedMotorSignalPayload = {
    ...payload,
    kind:
      payload.kind === 'fresh_activity' || payload.kind === 'backfill'
        ? payload.kind
        : inferMotorSignalKind(latestPublishedAt),
  };

  const insertPayload: TablesInsert<'feed_motor_signals'> = {
    customer_id: customerId,
    signal_type: 'nudge',
    payload: nextPayload,
  };

  const { data: inserted, error } = await supabase
    .from('feed_motor_signals')
    .insert(insertPayload)
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
    .update({ auto_resolved_at: resolvedAt } satisfies TablesUpdate<'feed_motor_signals'>)
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
    .update({ acknowledged_at: acknowledgedAt } satisfies TablesUpdate<'feed_motor_signals'>)
    .eq('id', signalId);
}
