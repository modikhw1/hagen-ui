// ─────────────────────────────────────────────────────────────────────────────
// TikTok history sync (ported into api-server).
//
// Self-contained: fetches RapidAPI tiktok-scraper7, deduplicates, inserts new
// clips into customer_concepts as history_import rows, updates stats on
// existing rows, and writes a sync_runs row per customer.
//
// Cost controls:
//   STALENESS_HOURS         — env: SYNC_STALENESS_HOURS, default 4
//   RAPIDAPI_DAILY_BUDGET   — env, default 800 (one full RapidAPI free tier day)
//   FULL_HISTORY_PAGES      — env: SYNC_FULL_HISTORY_PAGES, default 5
//   ADAPTIVE_QUIET_DAYS     — env: SYNC_ADAPTIVE_QUIET_DAYS, default 14
//
// Resilience:
//   - 429 responses are surfaced with retry-after-aware backoff.
//   - `customer_profiles.operation_lock_until` is taken per-customer and
//     released in `finally`. Stuck locks (>10 min old) are cleared on batch
//     start so a crashed cron does not freeze a customer forever.
// ─────────────────────────────────────────────────────────────────────────────

import { createSupabaseAdmin } from '../supabase.js';
import { logger } from '../logger.js';
import { getPriceOre, recordServiceUsage } from '../service-usage.js';

// Records one billable RapidAPI tiktok-scraper7 call. Best-effort: any
// failure is swallowed so it cannot affect the user-visible sync result.
async function recordRapidApiCall(extra?: Record<string, unknown>): Promise<void> {
  try {
    const perCallOre = await getPriceOre('rapidapi', 'per_call', 5);
    await recordServiceUsage({
      service: 'TikTok Fetcher',
      calls: 1,
      cost_ore: perCallOre,
      metadata: { source: 'tiktok-sync', data_source: 'measured', ...(extra ?? {}) },
    });
  } catch {
    /* best-effort */
  }
}

type SupabaseAdmin = ReturnType<typeof createSupabaseAdmin>;

const RAPIDAPI_HOST = 'tiktok-scraper7.p.rapidapi.com';
const LOCK_WINDOW_MS = 5 * 60 * 1000;
const LOCK_HEARTBEAT_MS = 60 * 1000;
const STUCK_LOCK_MS = 15 * 60 * 1000;
const DEFAULT_PAGE_SIZE = 10;
const MAX_PAGES = 10;

function clampPages(value: unknown, fallback: number): number {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n) || n < 1) return Math.max(1, Math.min(MAX_PAGES, fallback));
  return Math.min(MAX_PAGES, n);
}

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

const STALENESS_HOURS = () => envInt('SYNC_STALENESS_HOURS', 4);
const QUIET_DAYS = () => envInt('SYNC_ADAPTIVE_QUIET_DAYS', 14);
const FULL_HISTORY_PAGES = () => envInt('SYNC_FULL_HISTORY_PAGES', 5);
const RAPIDAPI_DAILY_BUDGET = () => envInt('RAPIDAPI_DAILY_BUDGET', 800);

// ── normalize ────────────────────────────────────────────────────────────────
export function normalizeTikTokUrl(url: string): string {
  try {
    const u = new URL(url.toLowerCase());
    u.search = '';
    u.pathname = u.pathname.replace(/\/+$/, '');
    const host = u.hostname.replace(/^www\./, '');
    return `https://${host}${u.pathname}`;
  } catch {
    return url.toLowerCase().replace(/[?#].*$/, '').replace(/\/+$/, '');
  }
}

interface Scraper7Video {
  video_id?: string;
  title?: string;
  cover?: string;
  origin_cover?: string;
  create_time?: number;
  play_count?: number;
  digg_count?: number;
  comment_count?: number;
}

interface NormalizedClip {
  tiktok_url: string;
  tiktok_thumbnail_url: string | null;
  tiktok_views: number | null;
  tiktok_likes: number | null;
  tiktok_comments: number | null;
  published_at: string | null;
  description: string | null;
  provider_video_id: string;
}

function normalizeVideo(v: Scraper7Video, handle: string): NormalizedClip | null {
  if (!v.video_id) return null;
  const thumbnail = (typeof v.origin_cover === 'string' && v.origin_cover) || (typeof v.cover === 'string' && v.cover) || null;
  const publishedAt = typeof v.create_time === 'number' && v.create_time > 0
    ? new Date(v.create_time * 1000).toISOString()
    : null;
  return {
    tiktok_url: `https://www.tiktok.com/@${handle}/video/${v.video_id}`,
    tiktok_thumbnail_url: thumbnail,
    tiktok_views: v.play_count ?? null,
    tiktok_likes: v.digg_count ?? null,
    tiktok_comments: v.comment_count ?? null,
    published_at: publishedAt,
    description: typeof v.title === 'string' && v.title.trim() ? v.title.trim() : null,
    provider_video_id: v.video_id,
  };
}

// ── HTTP with 429 backoff ────────────────────────────────────────────────────
class RateLimitError extends Error {
  retryAfterMs: number;
  constructor(retryAfterMs: number, message?: string) {
    super(message ?? `rate_limited (retry in ${retryAfterMs}ms)`);
    this.retryAfterMs = retryAfterMs;
  }
}

async function rapidApiFetch(
  url: string,
  apiKey: string,
  timeoutMs = 15000,
  endpointTag = 'unknown',
): Promise<Response> {
  // Bounded exponential backoff with jitter on 429. Respects Retry-After when
  // present, otherwise uses 1s, 2s, 4s + jitter. Gives up after 3 attempts and
  // surfaces a RateLimitError so the caller can stop the batch.
  //
  // RapidAPI bills every attempted request, so each iteration of this loop
  // (including the 429s and the terminal failure) records a service_costs row.
  const maxAttempts = 3;
  let lastRetryAfter = 0;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const res = await fetch(url, {
      headers: { 'x-rapidapi-key': apiKey, 'x-rapidapi-host': RAPIDAPI_HOST },
      signal: AbortSignal.timeout(timeoutMs),
    });
    void recordRapidApiCall({ endpoint: endpointTag, status: res.status, attempt });
    if (res.status !== 429) return res;

    const retryAfterHeader = Number(res.headers.get('retry-after'));
    const retryAfterMs = Number.isFinite(retryAfterHeader) && retryAfterHeader > 0
      ? retryAfterHeader * 1000
      : Math.floor((1000 * Math.pow(2, attempt - 1)) + (Math.random() * 500));
    lastRetryAfter = retryAfterMs;

    if (attempt === maxAttempts) {
      throw new RateLimitError(retryAfterMs, `tiktok-scraper7 429 after ${maxAttempts} attempts (retry-after=${retryAfterMs}ms)`);
    }
    // Cap a single backoff sleep at 60s so we never block too long.
    await new Promise((r) => setTimeout(r, Math.min(retryAfterMs, 60_000)));
  }
  // Unreachable, but keeps TypeScript happy.
  throw new RateLimitError(lastRetryAfter, 'tiktok-scraper7 429 (exhausted retries)');
}

interface FetchVideosResult {
  videos: Scraper7Video[];
  has_more: boolean;
  cursor: number | null;
  callsUsed: number;
}

async function fetchProviderVideos(
  handle: string, apiKey: string, count: number, cursor?: number,
): Promise<FetchVideosResult> {
  const url = new URL(`https://${RAPIDAPI_HOST}/user/posts`);
  url.searchParams.set('unique_id', handle);
  url.searchParams.set('count', String(count));
  if (cursor !== undefined) url.searchParams.set('cursor', String(cursor));
  const res = await rapidApiFetch(url.toString(), apiKey, 15000, 'user/posts');
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`tiktok-scraper7 ${res.status}${body ? `: ${body.slice(0, 200)}` : ''}`);
  }
  const data = await res.json() as { code?: number; data?: { videos?: Scraper7Video[]; cursor?: number; has_more?: boolean } };
  if (data.code !== 0) throw new Error(`tiktok-scraper7 response code ${data.code}`);
  return {
    videos: data.data?.videos ?? [],
    has_more: data.data?.has_more ?? false,
    cursor: data.data?.cursor ?? null,
    callsUsed: 1,
  };
}

interface FetchUserResult {
  followers: number;
  avatar: string | null;
  callsUsed: number;
}

async function fetchProviderUser(handle: string, apiKey: string): Promise<FetchUserResult> {
  const url = new URL(`https://${RAPIDAPI_HOST}/user/info`);
  url.searchParams.set('unique_id', handle);
  const res = await rapidApiFetch(url.toString(), apiKey, 10_000, 'user/info');
  if (!res.ok) return { followers: 0, avatar: null, callsUsed: 1 };
  const data = await res.json() as { code?: number; data?: { stats?: { followerCount?: number }; user?: { avatarMedium?: string } } };
  if (data.code !== 0) return { followers: 0, avatar: null, callsUsed: 1 };
  return {
    followers: data.data?.stats?.followerCount ?? 0,
    avatar: data.data?.user?.avatarMedium ?? null,
    callsUsed: 1,
  };
}

// ── single-customer sync ─────────────────────────────────────────────────────
export interface SyncOptions {
  mode: 'cron' | 'manual';
  pages?: number;
  pageSize?: number;
  startCursor?: number;
}

export interface SyncResult {
  fetched: number;
  imported: number;
  statsUpdated: number;
  /** Clips that existed and were already up-to-date (not new, not stat-changed). */
  skipped: number;
  callsUsed: number;
  pages: number;
  /** Whether the provider reports more pages beyond the last one we fetched. */
  has_more: boolean;
  /** Cursor to pass back for the next page, or null when exhausted. */
  cursor: number | null;
  error?: string;
  rateLimited?: boolean;
  retryAfterMs?: number;
  /** True when exactly one new clip was detected and auto-linked to the nu-slot concept. */
  autoReconciled?: boolean;
}

// ── Motor signal nudge helper ────────────────────────────────────────────────
// Creates or merges a nudge in feed_motor_signals so the workspace banner
// prompts the CM to review the new clip(s). Best-effort: any failure is
// swallowed so it cannot affect the user-visible sync result.
async function emitSyncNudge(
  supabase: SupabaseAdmin,
  customerId: string,
  payload: {
    imported_count: number;
    latest_published_at: string | null;
    auto_reconciled?: boolean;
    auto_reconciled_history_id?: string;
  },
): Promise<void> {
  try {
    const ageDays = payload.latest_published_at
      ? (Date.now() - new Date(payload.latest_published_at).getTime()) / (1000 * 60 * 60 * 24)
      : 0;
    const kind = ageDays <= 90 ? 'fresh_activity' : 'backfill';

    const { data: existing } = await supabase
      .from('feed_motor_signals')
      .select('id, payload')
      .eq('customer_id', customerId)
      .eq('signal_type', 'nudge')
      .is('acknowledged_at', null)
      .is('auto_resolved_at', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existing) {
      const ep = ((existing as Record<string, unknown>).payload ?? {}) as Record<string, unknown>;
      const existingCount = typeof ep.imported_count === 'number' ? Math.max(0, ep.imported_count) : 0;
      const epPublishedAt = typeof ep.latest_published_at === 'string' ? ep.latest_published_at : null;
      const mergedPublishedAt =
        payload.latest_published_at && epPublishedAt
          ? payload.latest_published_at > epPublishedAt ? payload.latest_published_at : epPublishedAt
          : (payload.latest_published_at ?? epPublishedAt);
      // Re-derive kind from the merged (most-recent) published timestamp so that
      // merging an older backfill import into a fresh-activity nudge keeps the kind accurate.
      const mergedAgeDays = mergedPublishedAt
        ? (Date.now() - new Date(mergedPublishedAt).getTime()) / (1000 * 60 * 60 * 24)
        : 0;
      const mergedKind = mergedAgeDays <= 90 ? 'fresh_activity' : 'backfill';
      // Preserve prior fields from existing payload, then overwrite with merged values.
      // auto_reconciled is overwritten by the incoming event's value (not inherited from
      // the existing payload) so stale auto-link messaging does not survive subsequent
      // non-auto-reconciled syncs that merge into the same active nudge.
      const mergedPayload: Record<string, unknown> = {
        ...ep,
        imported_count: existingCount + payload.imported_count,
        latest_published_at: mergedPublishedAt,
        kind: mergedKind,
        auto_reconciled: payload.auto_reconciled === true,
        auto_reconciled_history_id: payload.auto_reconciled === true ? payload.auto_reconciled_history_id : null,
      };
      const { error: updateErr } = await supabase
        .from('feed_motor_signals')
        .update({ payload: mergedPayload })
        .eq('id', (existing as { id: string }).id);
      if (updateErr) {
        logger.warn({ err: updateErr, customerId }, 'tiktok-sync: failed to merge nudge signal');
      }
    } else {
      const { error: insertErr } = await supabase
        .from('feed_motor_signals')
        .insert({
          customer_id: customerId,
          signal_type: 'nudge',
          payload: { ...payload, kind },
        });
      if (insertErr) {
        logger.warn({ err: insertErr, customerId }, 'tiktok-sync: failed to insert nudge signal');
      }
    }
  } catch {
    /* best-effort: any unexpected failure must not surface as a sync error */
  }
}

export async function syncCustomerHistory(
  supabase: SupabaseAdmin,
  customerId: string,
  handle: string,
  rapidApiKey: string,
  opts: SyncOptions,
): Promise<SyncResult> {
  const cleanedHandle = handle.trim().replace(/^@/, '');
  if (!cleanedHandle) return { fetched: 0, imported: 0, statsUpdated: 0, skipped: 0, callsUsed: 0, pages: 0, has_more: false, cursor: null, error: 'no_handle' };

  const now = new Date();
  const startedAt = now.toISOString();
  // Ownership-safe lock: each acquirer chooses a unique millisecond+jitter
  // timestamp; release/heartbeat queries match on this exact value, so a
  // second worker can never clear a first worker's still-valid lock.
  let currentLockUntil = new Date(now.getTime() + LOCK_WINDOW_MS + Math.floor(Math.random() * 1000)).toISOString();

  let lockColumnExists = true;
  const { data: lockRows, error: lockError } = await supabase
    .from('customer_profiles')
    .update({ operation_lock_until: currentLockUntil })
    .eq('id', customerId)
    .or(`operation_lock_until.is.null,operation_lock_until.lt.${startedAt}`)
    .select('id');
  if (lockError) {
    // Gracefully handle the case where the operation_lock_until column has not
    // yet been added to customer_profiles. In that case we proceed without a
    // distributed lock — the worst outcome is two concurrent syncs for the same
    // customer, which is safe (upserts are idempotent).
    const msg = lockError.message ?? '';
    if (msg.includes('operation_lock_until') && msg.includes('does not exist')) {
      logger.warn({ customerId }, 'tiktok-sync: operation_lock_until column missing, continuing without lock');
      lockColumnExists = false;
    } else {
      return { fetched: 0, imported: 0, statsUpdated: 0, skipped: 0, callsUsed: 0, pages: 0, has_more: false, cursor: null, error: `lock_error: ${lockError.message}` };
    }
  } else if (!lockRows || lockRows.length === 0) {
    return { fetched: 0, imported: 0, statsUpdated: 0, skipped: 0, callsUsed: 0, pages: 0, has_more: false, cursor: null, error: 'already_locked' };
  }

  // Heartbeat: extend our lock every minute so long-running syncs aren't
  // mistakenly treated as stuck. Each heartbeat checks ownership via the
  // previous timestamp value before writing the new one.
  // Skipped entirely when the column does not exist in this schema version.
  const heartbeat = lockColumnExists ? setInterval(() => {
    void (async () => {
      const next = new Date(Date.now() + LOCK_WINDOW_MS + Math.floor(Math.random() * 1000)).toISOString();
      const { data, error } = await supabase
        .from('customer_profiles')
        .update({ operation_lock_until: next })
        .eq('id', customerId)
        .eq('operation_lock_until', currentLockUntil)
        .select('id');
      if (!error && data && data.length > 0) currentLockUntil = next;
    })();
  }, LOCK_HEARTBEAT_MS) : null;

  const { data: syncRun } = await supabase
    .from('sync_runs')
    .insert({ customer_id: customerId, mode: opts.mode, started_at: startedAt, status: 'running' })
    .select('id')
    .single();
  const syncRunId = syncRun?.id as string | undefined;

  const totalPages = opts.pages ?? 1;
  const pageSize = opts.pageSize ?? DEFAULT_PAGE_SIZE;
  let totalFetched = 0;
  let totalImported = 0;
  let totalStatsUpdated = 0;
  let callsUsed = 0;
  let pagesProcessed = 0;
  let cursor: number | undefined = typeof opts.startCursor === 'number' ? opts.startCursor : undefined;
  let lastCursor: number | null = null;
  let lastHasMore = false;
  let errorMessage: string | undefined;
  let rateLimited = false;
  let retryAfterMs: number | undefined;
  let autoReconciled = false;
  let autoReconciledHistoryConceptId: string | null = null;
  let latestNewClipPublishedAt: string | null = null;
  // Collects the single history row inserted across all pages; only populated when
  // exactly one clip is inserted per page (we track across pages to enforce the
  // "total == 1" guard after pagination completes).
  let singleInsertedRow: { id: string; clip: NormalizedClip } | null = null;
  // Accumulate all clips across pages so we can write tiktok_videos + tiktok_stats
  // using the same data the drift tab reads.
  const allSyncedClips: NormalizedClip[] = [];
  let latestFollowers = 0;

  try {
    // fetch user (1 call) + first page (1 call)
    const userInfo = await fetchProviderUser(cleanedHandle, rapidApiKey).catch(() => ({ followers: 0, avatar: null, callsUsed: 1 }));
    callsUsed += userInfo.callsUsed;
    latestFollowers = userInfo.followers ?? 0;
    if (userInfo.avatar) {
      const { error: avatarErr } = await supabase
        .from('customer_profiles')
        .update({ tiktok_profile_pic_url: userInfo.avatar })
        .eq('id', customerId);
      if (avatarErr) throw new Error(`avatar_update_failed: ${avatarErr.message}`);
    }

    while (pagesProcessed < totalPages) {
      const page = await fetchProviderVideos(cleanedHandle, rapidApiKey, pageSize, cursor);
      callsUsed += page.callsUsed;
      pagesProcessed += 1;

      const observedAt = new Date().toISOString();
      const clips = page.videos.map((v) => normalizeVideo(v, cleanedHandle)).filter((c): c is NormalizedClip => Boolean(c));
      totalFetched += clips.length;
      allSyncedClips.push(...clips);

      if (clips.length > 0) {
        const { data: existing } = await supabase
          .from('customer_concepts')
          .select('id, tiktok_url, concept_id, reconciled_customer_concept_id')
          .eq('customer_profile_id', customerId)
          .in('tiktok_url', clips.map((c) => c.tiktok_url));

        // Build URL-to-row maps deterministically. After reconciliation copies
        // tiktok_url to the assignment row, both the imported_history row and the
        // assignment row may share the same URL. We must prefer the imported_history
        // row in existingByUrl so it is always updated via the primary path; the
        // reconciled assignment row then gets updated via reconciledAssignmentByRowId.
        // Assignment rows with URLs that have no matching imported_history row are
        // tracked separately so they also receive stats updates.
        const importedByUrl = new Map<string, string>(); // url → imported_history id
        const assignmentByUrl = new Map<string, string>(); // url → assignment id (no imported match)
        // Map from imported_history row id → reconciled assignment row id for
        // stats propagation after updating the imported_history row.
        const reconciledAssignmentByRowId = new Map<string, string>();
        for (const row of (existing ?? []) as Array<{ id: string; tiktok_url: string; concept_id: string | null; reconciled_customer_concept_id: string | null }>) {
          const normalizedUrl = normalizeTikTokUrl(row.tiktok_url);
          if (!row.concept_id) {
            importedByUrl.set(normalizedUrl, row.id);
            if (row.reconciled_customer_concept_id) {
              reconciledAssignmentByRowId.set(row.id, row.reconciled_customer_concept_id);
            }
          } else {
            assignmentByUrl.set(normalizedUrl, row.id);
          }
        }
        // existingByUrl: imported_history rows take precedence; assignment rows fill
        // in only when no imported_history row shares the URL.
        const existingByUrl = new Map<string, string>(importedByUrl);
        for (const [url, id] of assignmentByUrl) {
          if (!existingByUrl.has(url)) existingByUrl.set(url, id);
        }

        const newClips = clips.filter((c) => !existingByUrl.has(normalizeTikTokUrl(c.tiktok_url)));
        const updateClips = clips.filter((c) => existingByUrl.has(normalizeTikTokUrl(c.tiktok_url)));

        // Update stats on existing rows — surface any DB error so the run
        // is correctly marked failed.
        // Also propagate thumbnail + stats to any reconciled assignment row so
        // the LeT history card shows the latest thumbnail without needing the
        // read-time API overlay.
        if (updateClips.length > 0) {
          const updateResults = await Promise.all(updateClips.flatMap((c) => {
            const id = existingByUrl.get(normalizeTikTokUrl(c.tiktok_url))!;
            const statsPatch = {
              tiktok_views: c.tiktok_views,
              tiktok_likes: c.tiktok_likes,
              tiktok_comments: c.tiktok_comments,
              tiktok_thumbnail_url: c.tiktok_thumbnail_url ?? undefined,
              tiktok_last_synced_at: observedAt,
              last_observed_at: observedAt,
            };
            const updates = [supabase.from('customer_concepts').update(statsPatch).eq('id', id)];
            // If this imported_history row is reconciled to an assignment row, mirror
            // the thumbnail + stats onto the assignment row so the LeT card shows them.
            const assignmentId = reconciledAssignmentByRowId.get(id);
            if (assignmentId) {
              updates.push(supabase.from('customer_concepts').update({
                tiktok_thumbnail_url: c.tiktok_thumbnail_url ?? undefined,
                tiktok_views: c.tiktok_views,
                tiktok_likes: c.tiktok_likes,
                tiktok_comments: c.tiktok_comments,
                tiktok_last_synced_at: observedAt,
              }).eq('id', assignmentId));
            }
            return updates;
          }));
          const firstError = updateResults.find((r) => r.error)?.error;
          if (firstError) throw new Error(`stats_update_failed: ${firstError.message}`);
          totalStatsUpdated += updateClips.length;
        }

        // Insert new clips as imported_history rows. No feed_order assigned — these
        // sit outside the feed grid until a CM reconciles them manually, or the
        // auto-reconcile logic below links them when exactly one clip is observed.
        if (newClips.length > 0) {
          const inserts = newClips.map((c) => ({
            customer_profile_id: customerId,
            customer_id: customerId,
            concept_id: null,
            status: 'history_import',
            tiktok_url: c.tiktok_url,
            tiktok_thumbnail_url: c.tiktok_thumbnail_url,
            tiktok_views: c.tiktok_views,
            tiktok_likes: c.tiktok_likes,
            tiktok_comments: c.tiktok_comments,
            published_at: c.published_at,
            history_source: 'tiktok_profile' as const,
            observed_profile_handle: cleanedHandle,
            provider_name: 'rapidapi:tiktok-scraper7',
            provider_video_id: c.provider_video_id,
            first_observed_at: observedAt,
            last_observed_at: observedAt,
            tiktok_last_synced_at: observedAt,
          }));
          const { data: insertedRows, error: insertError } = await supabase.from('customer_concepts').insert(inserts).select('id');
          if (insertError) throw new Error(`insert_failed: ${insertError.message}`);
          totalImported += newClips.length;

          // Track the latest published_at across all newly imported clips.
          for (const c of newClips) {
            if (c.published_at && (!latestNewClipPublishedAt || c.published_at > latestNewClipPublishedAt)) {
              latestNewClipPublishedAt = c.published_at;
            }
          }

          // Record the inserted row only when exactly one clip was added on this page.
          // If a second clip ever comes in (this or a later page), nullify so the post-
          // loop guard sees totalImported > 1 and correctly skips auto-reconciliation.
          if (newClips.length === 1 && insertedRows && insertedRows.length === 1 && singleInsertedRow === null) {
            singleInsertedRow = { id: (insertedRows[0] as { id: string }).id, clip: newClips[0] };
          } else if (newClips.length > 1) {
            // More than one clip on this page — clear any previously recorded row so
            // we never auto-link when the total across the sync is >1.
            singleInsertedRow = null;
          }
        }

        // Track latest upload
        const latestPublished = clips.reduce<string | null>((max, c) => {
          if (!c.published_at) return max;
          return !max || c.published_at > max ? c.published_at : max;
        }, null);
        if (latestPublished) {
          const { error: uploadErr } = await supabase
            .from('customer_profiles')
            .update({ last_upload_at: latestPublished })
            .eq('id', customerId);
          if (uploadErr) throw new Error(`last_upload_update_failed: ${uploadErr.message}`);
        }
      }

      lastHasMore = page.has_more;
      lastCursor = page.cursor;
      if (!page.has_more || page.cursor === null) break;
      cursor = page.cursor;
    }

    // ── Persist tiktok_videos + tiktok_stats ─────────────────────────────────
    // These are the tables read by the drift tab and by loadPreviewMetrics in
    // the demo preview. The customer_concepts inserts above handle the feed
    // ingestion; this block keeps the analytics tables in sync so that any
    // feature that reads tiktok_videos / tiktok_stats gets live data.
    if (allSyncedClips.length > 0) {
      const videoRows = allSyncedClips
        .filter((c) => c.provider_video_id && c.published_at)
        .map((c) => ({
          customer_profile_id: customerId,
          video_id: c.provider_video_id,
          uploaded_at: c.published_at!,
          views: c.tiktok_views ?? 0,
          likes: c.tiktok_likes ?? 0,
          comments: c.tiktok_comments ?? 0,
          shares: 0,
          cover_image_url: c.tiktok_thumbnail_url ?? null,
          share_url: c.tiktok_url,
          raw_payload: { provider: 'rapidapi:tiktok-scraper7', description: c.description },
        }));

      if (videoRows.length > 0) {
        const { error: videoErr } = await supabase
          .from('tiktok_videos')
          .upsert(videoRows, { onConflict: 'customer_profile_id,video_id' });
        if (videoErr) {
          logger.warn({ err: videoErr }, 'tiktok-sync: tiktok_videos upsert failed (non-fatal)');
        }
      }

      // Daily stats snapshot — one row per customer per day (upsert by date).
      const snapshotDate = new Date().toISOString().slice(0, 10);
      const totalViews = allSyncedClips.reduce((s, c) => s + (c.tiktok_views ?? 0), 0);
      const totalLikes = allSyncedClips.reduce((s, c) => s + (c.tiktok_likes ?? 0), 0);
      const cutoff24h = Date.now() - 86_400_000;
      const last24h = allSyncedClips.filter((c) => c.published_at && new Date(c.published_at).getTime() >= cutoff24h);
      const totalViews24h = last24h.reduce((s, c) => s + (c.tiktok_views ?? 0), 0);
      const engagementRate = allSyncedClips.length > 0
        ? Number(((totalLikes / Math.max(1, totalViews)) * 100).toFixed(2))
        : 0;

      const { error: statsErr } = await supabase
        .from('tiktok_stats')
        .upsert({
          customer_profile_id: customerId,
          snapshot_date: snapshotDate,
          followers: latestFollowers,
          total_videos: allSyncedClips.length,
          videos_last_24h: last24h.length,
          total_views_24h: totalViews24h,
          engagement_rate: engagementRate,
          raw_payload: {
            provider: 'rapidapi:tiktok-scraper7',
            clip_count: allSyncedClips.length,
          },
        }, { onConflict: 'customer_profile_id,snapshot_date' });
      if (statsErr) {
        logger.warn({ err: statsErr }, 'tiktok-sync: tiktok_stats upsert failed (non-fatal)');
      }
    }

    // Auto-reconcile: runs once after all pages are processed so the guard is on
    // the total number of newly imported clips across the ENTIRE sync, not per page.
    //
    // Conditions (all must hold):
    //   1. Exactly one new clip was imported in this sync run (totalImported === 1).
    //   2. A nu-slot assignment exists (feed_order=0, concept_id IS NOT NULL).
    //   3. No history clip is already linked to that nu-slot assignment.
    //
    // If ambiguous (totalImported > 1 or no nu-slot), no auto-link is performed;
    // the regular nudge below still fires so CMs know to review.
    if (totalImported === 1 && singleInsertedRow !== null) {
      const { id: historyRowId, clip: singleClip } = singleInsertedRow;

      const { data: nuSlot, error: nuSlotErr } = await supabase
        .from('customer_concepts')
        .select('id')
        .eq('customer_profile_id', customerId)
        .eq('feed_order', 0)
        .not('concept_id', 'is', null)
        .limit(1)
        .maybeSingle();
      if (nuSlotErr) {
        logger.warn({ err: nuSlotErr }, 'tiktok-sync: auto-reconcile nu-slot lookup failed; skipping auto-link');
      }

      if (nuSlot) {
        const nuSlotId = (nuSlot as { id: string }).id;

        // Guard: skip if the nu-slot already has a history clip linked to it.
        const { data: existingLink, error: existingLinkErr } = await supabase
          .from('customer_concepts')
          .select('id')
          .eq('customer_profile_id', customerId)
          .eq('reconciled_customer_concept_id', nuSlotId)
          .limit(1)
          .maybeSingle();
        if (existingLinkErr) {
          logger.warn({ err: existingLinkErr }, 'tiktok-sync: auto-reconcile existing-link lookup failed; skipping auto-link');
        }

        if (!existingLink) {
          const autoNow = new Date().toISOString();
          const { error: autoLinkErr } = await supabase
            .from('customer_concepts')
            .update({
              reconciled_customer_concept_id: nuSlotId,
              reconciled_at: autoNow,
              // reconciled_by_cm_id intentionally null — system auto-link, not a CM action
            })
            .eq('id', historyRowId);

          if (!autoLinkErr) {
            autoReconciled = true;
            autoReconciledHistoryConceptId = historyRowId;

            // Propagate thumbnail + stats to the assignment row — mirrors the
            // manual POST /history/reconciliation route behaviour.
            const assignmentPatch: Record<string, unknown> = {};
            if (singleClip.tiktok_thumbnail_url) assignmentPatch.tiktok_thumbnail_url = singleClip.tiktok_thumbnail_url;
            if (singleClip.tiktok_url) assignmentPatch.tiktok_url = singleClip.tiktok_url;
            if (singleClip.tiktok_views != null) assignmentPatch.tiktok_views = singleClip.tiktok_views;
            if (singleClip.tiktok_likes != null) assignmentPatch.tiktok_likes = singleClip.tiktok_likes;
            if (singleClip.tiktok_comments != null) assignmentPatch.tiktok_comments = singleClip.tiktok_comments;
            if (singleClip.published_at) assignmentPatch.published_at = singleClip.published_at;
            if (Object.keys(assignmentPatch).length > 0) {
              const { error: patchErr } = await supabase
                .from('customer_concepts')
                .update(assignmentPatch)
                .eq('id', nuSlotId);
              if (patchErr) {
                logger.warn({ err: patchErr }, 'tiktok-sync: auto-reconcile failed to propagate stats to assignment row');
              }
            }
          } else {
            logger.warn({ err: autoLinkErr }, 'tiktok-sync: auto-reconcile link failed');
          }
        }
      }
    }

    // Emit a Granska nudge whenever new clips were imported.
    // When exactly one clip was auto-linked the payload carries auto_reconciled so
    // the workspace banner can surface a more specific "verify auto-link" message.
    if (totalImported > 0) {
      await emitSyncNudge(supabase, customerId, {
        imported_count: totalImported,
        latest_published_at: latestNewClipPublishedAt,
        ...(autoReconciled && autoReconciledHistoryConceptId
          ? { auto_reconciled: true, auto_reconciled_history_id: autoReconciledHistoryConceptId }
          : {}),
      });
    }

    const finishedAt = new Date().toISOString();
    const { error: stampErr } = await supabase
      .from('customer_profiles')
      .update({ last_history_sync_at: finishedAt, last_sync_error: null })
      .eq('id', customerId);
    if (stampErr) throw new Error(`stamp_update_failed: ${stampErr.message}`);
    if (syncRunId) {
      await (supabase as any).from('sync_runs').update({
        finished_at: finishedAt, status: 'ok',
        fetched_count: totalFetched, imported_count: totalImported, stats_updated_count: totalStatsUpdated,
        calls_used: callsUsed, error: null,
      }).eq('id', syncRunId);
    }
  } catch (err) {
    if (err instanceof RateLimitError) {
      rateLimited = true;
      retryAfterMs = err.retryAfterMs;
      errorMessage = err.message;
    } else {
      errorMessage = err instanceof Error ? err.message : String(err);
    }
    if (syncRunId) {
      await (supabase as any).from('sync_runs').update({
        finished_at: new Date().toISOString(), status: 'error',
        fetched_count: totalFetched, imported_count: totalImported, stats_updated_count: totalStatsUpdated,
        calls_used: callsUsed, error: errorMessage,
      }).eq('id', syncRunId);
    }
    await supabase.from('customer_profiles').update({ last_sync_error: errorMessage }).eq('id', customerId);
  } finally {
    if (heartbeat !== null) clearInterval(heartbeat);
    // Ownership-safe release: only clear the lock if it still matches the
    // value we last wrote. A second worker that already took the lock will
    // not be affected. Skip entirely when the column does not exist.
    if (lockColumnExists) {
      await supabase
        .from('customer_profiles')
        .update({ operation_lock_until: null })
        .eq('id', customerId)
        .eq('operation_lock_until', currentLockUntil);
    }
  }

  const skipped = Math.max(0, totalFetched - totalImported - totalStatsUpdated);
  return {
    fetched: totalFetched, imported: totalImported, statsUpdated: totalStatsUpdated, skipped,
    callsUsed, pages: pagesProcessed, has_more: lastHasMore, cursor: lastCursor,
    error: errorMessage, rateLimited, retryAfterMs,
    autoReconciled: autoReconciled || undefined,
  };
}

// ── batch / cron ─────────────────────────────────────────────────────────────
export interface BatchResult {
  processed: number;
  imported: number;
  statsUpdated: number;
  errors: Array<{ customerId: string; error: string }>;
  callsUsed: number;
  budgetRemaining: number;
  budgetExceeded: boolean;
  staleLocksCleared: number;
  thumbnailsRefreshed?: number;
}

interface EligibleCustomer {
  id: string;
  tiktok_handle: string | null;
  status: string | null;
  last_history_sync_at: string | null;
  last_upload_at: string | null;
}

export async function runHistorySyncBatch(rapidApiKey: string): Promise<BatchResult> {
  const supabase = createSupabaseAdmin();
  const stalenessHours = STALENESS_HOURS();
  const quietDays = QUIET_DAYS();
  const dailyBudget = RAPIDAPI_DAILY_BUDGET();

  // Clear stuck locks (best-effort — silently skipped when the column does not exist)
  const stuckCutoff = new Date(Date.now() - STUCK_LOCK_MS).toISOString();
  const { data: clearedLocks, error: clearLocksErr } = await supabase
    .from('customer_profiles')
    .update({ operation_lock_until: null })
    .lt('operation_lock_until', stuckCutoff)
    .select('id');
  const staleLocksCleared = clearLocksErr ? 0 : (clearedLocks?.length ?? 0);
  if (staleLocksCleared > 0) {
    logger.warn({ staleLocksCleared }, 'tiktok-sync cleared stuck locks');
  }

  // Get eligible customers (must have a TikTok handle and an active-ish status)
  const cutoff = new Date(Date.now() - stalenessHours * 60 * 60 * 1000).toISOString();
  const { data: customers, error } = await supabase
    .from('customer_profiles')
    .select('id, tiktok_handle, status, last_history_sync_at, last_upload_at')
    .in('status', ['active', 'agreed', 'invited', 'prospect'])
    .not('tiktok_handle', 'is', null)
    .neq('tiktok_handle', '');
  if (error) throw new Error(error.message);

  const quietCutoff = new Date(Date.now() - quietDays * 24 * 60 * 60 * 1000).toISOString();
  const dailyCutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const eligible = ((customers ?? []) as EligibleCustomer[]).filter((c) => {
    if (!c.tiktok_handle?.trim()) return false;
    // Initial backfill: never synced → always eligible
    if (!c.last_history_sync_at) return true;
    // Adaptive: quiet customers (>quietDays since last upload) sync max 1×/day
    const isQuiet = !c.last_upload_at || c.last_upload_at < quietCutoff;
    if (isQuiet) return c.last_history_sync_at < dailyCutoff;
    return c.last_history_sync_at < cutoff;
  });

  // Persisted per-day budget: sum calls_used across sync_runs in last 24h
  // so the budget holds across the four daily cron invocations.
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: recentRuns } = await supabase
    .from('sync_runs')
    .select('calls_used')
    .gte('started_at', dayAgo);
  const priorCallsToday = ((recentRuns ?? []) as Array<{ calls_used: number | null }>)
    .reduce((sum, r) => sum + (Number(r.calls_used) || 0), 0);

  // Open an aggregate row for this entire cron invocation. customer_id NULL
  // would violate FK, so we use the synthetic batch UUID convention: write
  // an aggregate row using the first eligible customer's id (or the first we
  // touch). If no customers are eligible we just return early below.
  const aggregateStart = new Date().toISOString();

  let callsUsed = 0;
  let imported = 0;
  let statsUpdated = 0;
  const errors: Array<{ customerId: string; error: string }> = [];
  let processed = 0;
  let budgetExceeded = false;

  for (const customer of eligible) {
    if (priorCallsToday + callsUsed >= dailyBudget) {
      budgetExceeded = true;
      break;
    }
    const handle = customer.tiktok_handle!.trim().replace(/^@/, '');
    if (!handle) continue;

    const result = await syncCustomerHistory(supabase, customer.id, handle, rapidApiKey, { mode: 'cron' });
    callsUsed += result.callsUsed;
    processed += 1;
    imported += result.imported;
    statsUpdated += result.statsUpdated;

    if (result.error && result.error !== 'already_locked') {
      errors.push({ customerId: customer.id, error: result.error });
      // On 429, stop the batch — preserves budget for the next run
      if (result.rateLimited) {
        budgetExceeded = true;
        break;
      }
    }

    // small inter-customer delay
    await new Promise((r) => setTimeout(r, 300));
  }

  // After all per-customer syncs complete, run a global thumbnail-refresh pass
  // so any assignment row that missed a thumbnail update during a prior sync is
  // corrected.
  let thumbnailsRefreshed: number | undefined;
  try {
    const refreshResult = await refreshReconciledThumbnails(supabase);
    thumbnailsRefreshed = refreshResult.updated;
  } catch (refreshErr) {
    logger.warn({ err: refreshErr }, 'tiktok-sync: refreshReconciledThumbnails failed (non-fatal)');
  }

  const result: BatchResult = {
    processed, imported, statsUpdated, errors, callsUsed,
    budgetRemaining: Math.max(0, dailyBudget - priorCallsToday - callsUsed),
    budgetExceeded, staleLocksCleared,
    thumbnailsRefreshed,
  };

  // Write a single aggregate cron-invocation row to cron_run_log so the
  // /api/admin/cron-runs admin view can show one row per cron invocation.
  // The api-server uses an untyped Supabase client, so a small `as any` cast
  // matches the established pattern in this file's siblings.
  const { error: cronLogError } = await (supabase as any).from('cron_run_log').insert({
    started_at: aggregateStart,
    finished_at: new Date().toISOString(),
    processed,
    imported,
    stats_updated: statsUpdated,
    calls_used: callsUsed,
    budget_remaining: result.budgetRemaining,
    budget_exceeded: budgetExceeded,
    stale_locks_cleared: staleLocksCleared,
    errors: errors.length > 0 ? errors : null,
    thumbnails_refreshed: thumbnailsRefreshed ?? 0,
  });
  if (cronLogError) {
    logger.warn({ err: cronLogError.message }, 'cron_run_log insert failed (non-fatal)');
  }

  return result;
}

// ── reconciled-thumbnail refresh ──────────────────────────────────────────────
// Sweeps all imported_history rows that are linked to an assignment row and
// copies the latest thumbnail_url from the history row onto the assignment row.
//
// This is a safety-net for the edge case where TikTok rotates a thumbnail URL
// after a stats-only sync already wrote the new URL to the imported_history row
// but failed (or hadn't yet been added) to propagate it to the assignment row.
//
// Runs at the end of every `runHistorySyncBatch` call and can also be triggered
// independently via the /internal/refresh-reconciled-thumbnails endpoint.
//
// customerId is optional: when supplied only that customer's rows are swept;
// when omitted the entire customer_concepts table is swept globally.
export async function refreshReconciledThumbnails(
  supabase: SupabaseAdmin,
  customerId?: string,
): Promise<{ updated: number; errors: number }> {
  // Fetch all imported_history rows that are reconciled to an assignment row and
  // carry a thumbnail URL worth propagating.
  let query = supabase
    .from('customer_concepts')
    .select('id, tiktok_thumbnail_url, reconciled_customer_concept_id')
    .is('concept_id', null)
    .not('reconciled_customer_concept_id', 'is', null)
    .not('tiktok_thumbnail_url', 'is', null);

  if (customerId) {
    query = query.eq('customer_profile_id', customerId);
  }

  const { data: reconciledRows, error: fetchErr } = await query;
  if (fetchErr) throw new Error(`refreshReconciledThumbnails: fetch failed: ${fetchErr.message}`);

  const rows = (reconciledRows ?? []) as Array<{
    id: string;
    tiktok_thumbnail_url: string;
    reconciled_customer_concept_id: string;
  }>;

  if (rows.length === 0) return { updated: 0, errors: 0 };

  let updated = 0;
  let errors = 0;

  // Process in small batches to avoid unbounded concurrent DB writes at scale.
  const BATCH = 10;
  for (let i = 0; i < rows.length; i += BATCH) {
    await Promise.all(rows.slice(i, i + BATCH).map(async (row) => {
      const { error } = await supabase
        .from('customer_concepts')
        .update({ tiktok_thumbnail_url: row.tiktok_thumbnail_url })
        .eq('id', row.reconciled_customer_concept_id);
      if (error) {
        logger.warn(
          { err: error, historyId: row.id, assignmentId: row.reconciled_customer_concept_id },
          'tiktok-sync: refreshReconciledThumbnails update failed',
        );
        errors += 1;
      } else {
        updated += 1;
      }
    }));
  }

  logger.info(
    { customerId: customerId ?? 'all', scanned: rows.length, updated, errors },
    'tiktok-sync: refreshReconciledThumbnails done',
  );
  return { updated, errors };
}

// ── helper: background fire-and-forget initial backfill on linkage ───────────
export function triggerInitialTikTokSyncBackground(params: {
  customerId: string;
  tiktokHandle: string | null | undefined;
  source: 'invite' | 'profile_link';
}): void {
  const handle = typeof params.tiktokHandle === 'string' ? params.tiktokHandle.trim().replace(/^@/, '') : '';
  if (!handle) return;
  const apiKey = process.env['RAPIDAPI_KEY'];
  if (!apiKey) {
    logger.warn({ customerId: params.customerId }, 'tiktok-sync skipped: RAPIDAPI_KEY missing');
    return;
  }
  const supabase = createSupabaseAdmin();
  const pages = clampPages(FULL_HISTORY_PAGES(), 5);
  // Fire-and-forget; never block the caller
  void syncCustomerHistory(supabase, params.customerId, handle, apiKey, { mode: 'manual', pages, pageSize: 50 })
    .then((result) => {
      logger.info({ customerId: params.customerId, source: params.source, ...result }, 'initial tiktok backfill done');
    })
    .catch((err) => {
      logger.error({ err, customerId: params.customerId, source: params.source }, 'initial tiktok backfill failed');
    });
}
