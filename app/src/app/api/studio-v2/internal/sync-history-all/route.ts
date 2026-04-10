import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdmin } from '@/lib/server/supabase-admin';
import { fetchProviderVideos, normalizeVideo } from '@/lib/studio/tiktok-provider';
import { importClipsForCustomer } from '@/lib/studio/history-import';

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/studio-v2/internal/sync-history-all
//
// Internal cron-safe route. NOT wrapped in withAuth.
// Protected by: Authorization: Bearer <CRON_SECRET>
//
// Iterates all eligible customers and fetches recent TikTok clips for each.
// Writes motor signals for any customer where new clips are found.
//
// Eligible criteria:
//   - status IN ('active', 'agreed')
//   - tiktok_handle IS NOT NULL AND tiktok_handle != ''
//   - last_history_sync_at IS NULL OR last_history_sync_at < NOW() - 1h
//
// Per-customer flow:
//   1. Call tiktok-scraper7 for the most recent SYNC_COUNT clips
//   2. Normalize + deduplicate + insert + renumber (via importClipsForCustomer)
//   3. Write motorSignalNewEvidence if any new clips were imported
//
// Returns:
//   { processed, signaled, skipped, errors }
//   processed — customers attempted
//   signaled  — customers that received new clips (motor signal written)
//   skipped   — customers attempted but no new clips found
//   errors    — [{ customerId, error }] per-customer failures (partial progress)
//
// Required env vars:
//   CRON_SECRET  — shared secret validated in Authorization header
//   RAPIDAPI_KEY — RapidAPI key for tiktok-scraper7
// ─────────────────────────────────────────────────────────────────────────────

const SYNC_COUNT_PER_CUSTOMER = 10;
// 1-hour gate: each customer is processed at most once per cron cycle.
// Matches the hourly workflow schedule — a customer synced at 10:00 passes
// the gate again at 11:00, giving near-hourly observation during business hours.
// Previously 23 (daily), which made the hourly schedule a no-op.
const STALENESS_HOURS = 1;

export const POST = async (request: NextRequest): Promise<NextResponse> => {
  // ── 1. Validate CRON_SECRET ───────────────────────────────────────────────
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: 'CRON_SECRET is not configured' }, { status: 503 });
  }

  const authHeader = request.headers.get('authorization') ?? '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (token !== cronSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // ── 2. Check provider key ─────────────────────────────────────────────────
  const rapidApiKey = process.env.RAPIDAPI_KEY;
  if (!rapidApiKey) {
    return NextResponse.json({ error: 'RAPIDAPI_KEY is not configured' }, { status: 503 });
  }

  const supabase = createSupabaseAdmin();

  // ── 3. Query eligible customers ───────────────────────────────────────────
  const cutoff = new Date(Date.now() - STALENESS_HOURS * 60 * 60 * 1000).toISOString();

  const { data: customers, error: queryError } = await supabase
    .from('customer_profiles')
    .select('id, tiktok_handle')
    .in('status', ['active', 'agreed'])
    .not('tiktok_handle', 'is', null)
    .neq('tiktok_handle', '')
    .or(`last_history_sync_at.is.null,last_history_sync_at.lt.${cutoff}`);

  if (queryError) {
    return NextResponse.json({ error: queryError.message }, { status: 500 });
  }

  const eligible = (customers ?? []) as Array<{ id: string; tiktok_handle: string }>;

  // ── 4. Process each customer — partial progress on failure ────────────────
  let signaled = 0;
  let skipped = 0;
  const errors: Array<{ customerId: string; error: string }> = [];

  for (const customer of eligible) {
    const handle = customer.tiktok_handle.trim().replace(/^@/, '');

    try {
      // Fetch from provider
      const { videos, error: fetchError } = await fetchProviderVideos(
        handle,
        rapidApiKey,
        SYNC_COUNT_PER_CUSTOMER
      );

      if (fetchError) {
        errors.push({ customerId: customer.id, error: fetchError });
        continue;
      }

      // Normalize
      const clips = videos
        .map((v) => normalizeVideo(v, handle))
        .filter((c): c is NonNullable<typeof c> => c !== null);

      // Provider returned videos but all failed normalization — likely an API format
      // change or unexpected data shape. Do NOT stamp last_history_sync_at so this
      // customer is retried next cycle. Surface as a named error for log visibility.
      if (videos.length > 0 && clips.length === 0) {
        errors.push({
          customerId: customer.id,
          error: `normalization_failure: provider returned ${videos.length} video(s) for @${handle} but all failed normalization`,
        });
        continue;
      }

      // Provider returned no videos — empty feed or brand-new account.
      // Stamp sync time so we don't retry until the 23h gate expires.
      if (clips.length === 0) {
        await supabase
          .from('customer_profiles')
          .update({ last_history_sync_at: new Date().toISOString() })
          .eq('id', customer.id);
        skipped++;
        continue;
      }

      // Deduplicate, insert, renumber, motor signal
      const { imported } = await importClipsForCustomer(supabase, customer.id, clips);

      if (imported > 0) {
        signaled++;
      } else {
        skipped++;
      }
    } catch (err) {
      errors.push({ customerId: customer.id, error: (err as Error).message });
    }
  }

  return NextResponse.json({
    processed: eligible.length,
    signaled,
    skipped,
    errors,
  });
};
