import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdmin } from '@/lib/server/supabase-admin';
import { fetchProviderVideos, normalizeVideo } from '@/lib/studio/tiktok-provider';
import { updateClipStats, importNewClips } from '@/lib/studio/history-import';
import { autoReconcileAndAdvance } from '@/lib/studio/auto-reconcile';
import { motorSignalNewEvidence, createMotorSignalNudge, classifyMotorSignal } from '@/lib/studio/motor-signal';

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/studio-v2/internal/sync-history-all
//
// Internal cron-safe route. NOT wrapped in withAuth.
// Protected by: Authorization: Bearer <CRON_SECRET>
//
// Per-customer pipeline (in this exact order):
//   1. fetchProfileHistory  — fetch new clips from TikTok provider
//   2. updateExistingStats  — update stats on already-imported clips (always runs)
//   3. autoReconcileAndAdvance — match new clips to nu-slot, advance plan
//   4. checkMotorSignals    — create nudge if needed (after reconcile, not before)
//   5. updateLastSyncTimestamp — stamp last_history_sync_at
//
// Eligible criteria:
//   - status IN ('active', 'agreed')
//   - tiktok_handle IS NOT NULL AND tiktok_handle != ''
//   - last_history_sync_at IS NULL OR older than STALENESS_HOURS
//
// Response:
//   { processed, new_clips, stats_updated, reconciled, nudges_created, errors }
//
// Env vars:
//   CRON_SECRET       — validated in Authorization header
//   RAPIDAPI_KEY      — RapidAPI key for tiktok-scraper7
//   TIKTOK_DELAY_MS   — delay between customers (default 500ms)
// ─────────────────────────────────────────────────────────────────────────────

const SYNC_COUNT_PER_CUSTOMER = 10;
const STALENESS_HOURS = 1;

// ── withRetry ────────────────────────────────────────────────────────────────
/**
 * Wraps an async operation with exponential-backoff retry.
 * On HTTP 429 (rate limit) the error is re-thrown immediately without retry.
 */
async function withRetry<T>(fn: () => Promise<T>, maxRetries = 2, delayMs = 1000): Promise<T> {
  for (let i = 0; i <= maxRetries; i++) {
    try {
      return await fn();
    } catch (e) {
      const message = (e as Error).message ?? '';
      // Rate limit: don't retry, propagate immediately
      if (message.includes('429') || message.toLowerCase().includes('rate limit')) {
        throw e;
      }
      if (i === maxRetries) throw e;
      await new Promise((r) => setTimeout(r, delayMs * (i + 1)));
    }
  }
  // TypeScript requires this but it's unreachable
  throw new Error('withRetry: unreachable');
}

export const POST = async (request: NextRequest): Promise<NextResponse> => {
  // ── 1. Auth ────────────────────────────────────────────────────────────────
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: 'CRON_SECRET is not configured' }, { status: 503 });
  }

  const authHeader = request.headers.get('authorization') ?? '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (token !== cronSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const rapidApiKey = process.env.RAPIDAPI_KEY;
  if (!rapidApiKey) {
    return NextResponse.json({ error: 'RAPIDAPI_KEY is not configured' }, { status: 503 });
  }

  // Delay between customers (rate limiting)
  const delayMs = parseInt(process.env.TIKTOK_DELAY_MS ?? '500', 10);

  const supabase = createSupabaseAdmin();

  // ── 2. Query eligible customers ────────────────────────────────────────────
  const cutoff = new Date(Date.now() - STALENESS_HOURS * 60 * 60 * 1000).toISOString();

  const { data: customers, error: queryError } = await supabase
    .from('customer_profiles')
    .select('id, tiktok_handle, pending_history_advance, pending_history_advance_published_at')
    .in('status', ['active', 'agreed'])
    .not('tiktok_handle', 'is', null)
    .neq('tiktok_handle', '')
    .or(`last_history_sync_at.is.null,last_history_sync_at.lt.${cutoff}`);

  if (queryError) {
    return NextResponse.json({ error: queryError.message }, { status: 500 });
  }

  const eligible = (customers ?? []) as Array<{
    id: string;
    tiktok_handle: string;
    pending_history_advance: number | null;
    pending_history_advance_published_at: string | null;
  }>;

  // ── 3. Process each customer ───────────────────────────────────────────────
  let newClipsTotal = 0;
  let statsUpdatedTotal = 0;
  let reconciledTotal = 0;
  let nudgesCreatedTotal = 0;
  const errors: Array<{ customerId: string; step: string; error: string }> = [];

  for (const customer of eligible) {
    const handle = customer.tiktok_handle.trim().replace(/^@/, '');

    // Skip: no handle (shouldn't happen given query filter, but guard anyway)
    if (!handle) {
      errors.push({ customerId: customer.id, step: 'fetchProfileHistory', error: 'no_tiktok_handle' });
      continue;
    }

    let stepError = false;

    // Step 1: fetchProfileHistory
    let clips: ReturnType<typeof normalizeVideo>[] = [];
    try {
      const { videos, error: fetchError } = await withRetry(() =>
        fetchProviderVideos(handle, rapidApiKey, SYNC_COUNT_PER_CUSTOMER)
      );

      if (fetchError) {
        // 429 rate limit: skip customer, log error
        if (fetchError.includes('429') || fetchError.toLowerCase().includes('rate limit')) {
          errors.push({ customerId: customer.id, step: 'fetchProfileHistory', error: `rate_limited: ${fetchError}` });
          stepError = true;
        } else {
          errors.push({ customerId: customer.id, step: 'fetchProfileHistory', error: fetchError });
          stepError = true;
        }
      } else {
        clips = videos
          .map((v) => normalizeVideo(v, handle))
          .filter((c): c is NonNullable<typeof c> => c !== null);

        if (videos.length > 0 && clips.length === 0) {
          errors.push({
            customerId: customer.id,
            step: 'fetchProfileHistory',
            error: `normalization_failure: ${videos.length} video(s) all failed normalization`,
          });
          // Don't stamp sync time so this customer is retried next cycle
          stepError = true;
        }
      }
    } catch (err) {
      const msg = (err as Error).message ?? String(err);
      const isRateLimit = msg.includes('429') || msg.toLowerCase().includes('rate limit');
      errors.push({
        customerId: customer.id,
        step: 'fetchProfileHistory',
        error: isRateLimit ? `rate_limited: ${msg}` : msg,
      });
      stepError = true;
    }

    if (stepError) continue;

    // Step 2: updateExistingStats (always runs, even if no new clips)
    let statsUpdated = 0;
    if (clips.length > 0) {
      try {
        statsUpdated = await withRetry(() => updateClipStats(supabase, customer.id, clips as Parameters<typeof updateClipStats>[2]));
        statsUpdatedTotal += statsUpdated;
      } catch (err) {
        errors.push({ customerId: customer.id, step: 'updateExistingStats', error: (err as Error).message });
        // Non-fatal: continue to reconcile/signal steps
      }
    }

    // Step 3: autoReconcileAndAdvance
    // Import new clips first (they need to be in DB for reconcile to find them)
    let imported = 0;
    if (clips.length > 0) {
      try {
        const result = await importNewClips(supabase, customer.id, clips as Parameters<typeof importNewClips>[2]);
        imported = result.imported;
        newClipsTotal += imported;
      } catch (err) {
        errors.push({ customerId: customer.id, step: 'importNewClips', error: (err as Error).message });
        // Non-fatal: continue
      }

      if (imported > 0) {
        try {
          const reconcileResult = await autoReconcileAndAdvance(supabase, customer.id);
          if (reconcileResult.advanced) reconciledTotal++;
        } catch (err) {
          errors.push({ customerId: customer.id, step: 'autoReconcileAndAdvance', error: (err as Error).message });
        }
      }
    }

    // Step 4: checkMotorSignals (runs AFTER reconcile)
    if (imported > 0) {
      try {
        const sortedClips = [...(clips as Array<{ published_at?: string | null }>)]
          .filter((c) => c.published_at)
          .sort((a, b) => new Date(b.published_at!).getTime() - new Date(a.published_at!).getTime());
        const latestPublishedAt = sortedClips[0]?.published_at ?? null;

        // Update customer_profiles motor signal (legacy columns)
        const existingCount = customer.pending_history_advance ?? 0;
        const existingPublishedAt = customer.pending_history_advance_published_at ?? null;
        const accumulatedPublishedAt =
          latestPublishedAt && existingPublishedAt
            ? (latestPublishedAt > existingPublishedAt ? latestPublishedAt : existingPublishedAt)
            : (latestPublishedAt ?? existingPublishedAt);

        await supabase
          .from('customer_profiles')
          .update(motorSignalNewEvidence(existingCount + imported, accumulatedPublishedAt))
          .eq('id', customer.id);

        // Create durable nudge row in feed_motor_signals (only if no active nudge)
        const kind = classifyMotorSignal({
          pending_history_advance: existingCount + imported,
          pending_history_advance_published_at: accumulatedPublishedAt,
        });
        const signalId = await createMotorSignalNudge(supabase, customer.id, {
          imported_count: imported,
          latest_published_at: latestPublishedAt,
          kind: kind ?? 'fresh_activity',
        });
        if (signalId) nudgesCreatedTotal++;
      } catch (err) {
        errors.push({ customerId: customer.id, step: 'checkMotorSignals', error: (err as Error).message });
      }
    }

    // Step 5: updateLastSyncTimestamp (only if no fatal step error for this customer)
    try {
      await supabase
        .from('customer_profiles')
        .update({ last_history_sync_at: new Date().toISOString() })
        .eq('id', customer.id);
    } catch (err) {
      errors.push({ customerId: customer.id, step: 'updateLastSyncTimestamp', error: (err as Error).message });
    }

    // Rate limiting: delay between customers
    if (delayMs > 0 && eligible.indexOf(customer) < eligible.length - 1) {
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }

  // Always return HTTP 200 (partial failures are in errors[])
  return NextResponse.json({
    processed: eligible.length,
    new_clips: newClipsTotal,
    stats_updated: statsUpdatedTotal,
    reconciled: reconciledTotal,
    nudges_created: nudgesCreatedTotal,
    errors,
  });
};
