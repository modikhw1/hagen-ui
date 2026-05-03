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

async function rapidApiFetch(url: string, apiKey: string, timeoutMs = 15000): Promise<Response> {
  // Bounded exponential backoff with jitter on 429. Respects Retry-After when
  // present, otherwise uses 1s, 2s, 4s + jitter. Gives up after 3 attempts and
  // surfaces a RateLimitError so the caller can stop the batch.
  const maxAttempts = 3;
  let lastRetryAfter = 0;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const res = await fetch(url, {
      headers: { 'x-rapidapi-key': apiKey, 'x-rapidapi-host': RAPIDAPI_HOST },
      signal: AbortSignal.timeout(timeoutMs),
    });
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
  const res = await rapidApiFetch(url.toString(), apiKey);
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
  const res = await rapidApiFetch(url.toString(), apiKey, 10_000);
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
}

export interface SyncResult {
  fetched: number;
  imported: number;
  statsUpdated: number;
  callsUsed: number;
  pages: number;
  error?: string;
  rateLimited?: boolean;
  retryAfterMs?: number;
}

export async function syncCustomerHistory(
  supabase: SupabaseAdmin,
  customerId: string,
  handle: string,
  rapidApiKey: string,
  opts: SyncOptions,
): Promise<SyncResult> {
  const cleanedHandle = handle.trim().replace(/^@/, '');
  if (!cleanedHandle) return { fetched: 0, imported: 0, statsUpdated: 0, callsUsed: 0, pages: 0, error: 'no_handle' };

  const now = new Date();
  const startedAt = now.toISOString();
  // Ownership-safe lock: each acquirer chooses a unique millisecond+jitter
  // timestamp; release/heartbeat queries match on this exact value, so a
  // second worker can never clear a first worker's still-valid lock.
  let currentLockUntil = new Date(now.getTime() + LOCK_WINDOW_MS + Math.floor(Math.random() * 1000)).toISOString();

  const { data: lockRows, error: lockError } = await supabase
    .from('customer_profiles')
    .update({ operation_lock_until: currentLockUntil })
    .eq('id', customerId)
    .or(`operation_lock_until.is.null,operation_lock_until.lt.${startedAt}`)
    .select('id');
  if (lockError) return { fetched: 0, imported: 0, statsUpdated: 0, callsUsed: 0, pages: 0, error: `lock_error: ${lockError.message}` };
  if (!lockRows || lockRows.length === 0) {
    return { fetched: 0, imported: 0, statsUpdated: 0, callsUsed: 0, pages: 0, error: 'already_locked' };
  }

  // Heartbeat: extend our lock every minute so long-running syncs aren't
  // mistakenly treated as stuck. Each heartbeat checks ownership via the
  // previous timestamp value before writing the new one.
  const heartbeat = setInterval(() => {
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
  }, LOCK_HEARTBEAT_MS);

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
  let cursor: number | undefined;
  let errorMessage: string | undefined;
  let rateLimited = false;
  let retryAfterMs: number | undefined;

  try {
    // fetch user (1 call) + first page (1 call)
    const userInfo = await fetchProviderUser(cleanedHandle, rapidApiKey).catch(() => ({ followers: 0, avatar: null, callsUsed: 1 }));
    callsUsed += userInfo.callsUsed;
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

      if (clips.length > 0) {
        const urls = clips.map((c) => normalizeTikTokUrl(c.tiktok_url));
        const { data: existing } = await supabase
          .from('customer_concepts')
          .select('id, tiktok_url')
          .eq('customer_profile_id', customerId)
          .in('tiktok_url', clips.map((c) => c.tiktok_url));
        const existingByUrl = new Map<string, string>();
        for (const row of (existing ?? []) as Array<{ id: string; tiktok_url: string }>) {
          existingByUrl.set(normalizeTikTokUrl(row.tiktok_url), row.id);
        }

        const newClips = clips.filter((c) => !existingByUrl.has(normalizeTikTokUrl(c.tiktok_url)));
        const updateClips = clips.filter((c) => existingByUrl.has(normalizeTikTokUrl(c.tiktok_url)));

        // Update stats on existing rows — surface any DB error so the run
        // is correctly marked failed.
        if (updateClips.length > 0) {
          const updateResults = await Promise.all(updateClips.map((c) => {
            const id = existingByUrl.get(normalizeTikTokUrl(c.tiktok_url))!;
            return supabase.from('customer_concepts').update({
              tiktok_views: c.tiktok_views,
              tiktok_likes: c.tiktok_likes,
              tiktok_comments: c.tiktok_comments,
              tiktok_thumbnail_url: c.tiktok_thumbnail_url ?? undefined,
              tiktok_last_synced_at: observedAt,
              last_observed_at: observedAt,
            }).eq('id', id);
          }));
          const firstError = updateResults.find((r) => r.error)?.error;
          if (firstError) throw new Error(`stats_update_failed: ${firstError.message}`);
          totalStatsUpdated += updateClips.length;
        }

        // Insert new clips as history_import (no feed_order shifting here —
        // auto-reconcile is handled by a downstream task)
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
          const { error: insertError } = await supabase.from('customer_concepts').insert(inserts);
          if (insertError) throw new Error(`insert_failed: ${insertError.message}`);
          totalImported += newClips.length;
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

      if (!page.has_more || page.cursor === null) break;
      cursor = page.cursor;
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
    clearInterval(heartbeat);
    // Ownership-safe release: only clear the lock if it still matches the
    // value we last wrote. A second worker that already took the lock will
    // not be affected.
    await supabase
      .from('customer_profiles')
      .update({ operation_lock_until: null })
      .eq('id', customerId)
      .eq('operation_lock_until', currentLockUntil);
  }

  return {
    fetched: totalFetched, imported: totalImported, statsUpdated: totalStatsUpdated,
    callsUsed, pages: pagesProcessed, error: errorMessage, rateLimited, retryAfterMs,
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

  // Clear stuck locks
  const stuckCutoff = new Date(Date.now() - STUCK_LOCK_MS).toISOString();
  const { data: clearedLocks } = await supabase
    .from('customer_profiles')
    .update({ operation_lock_until: null })
    .lt('operation_lock_until', stuckCutoff)
    .select('id');
  const staleLocksCleared = clearedLocks?.length ?? 0;
  if (staleLocksCleared > 0) {
    logger.warn({ staleLocksCleared }, 'tiktok-sync cleared stuck locks');
  }

  // Get eligible customers (must have a TikTok handle and an active-ish status)
  const cutoff = new Date(Date.now() - stalenessHours * 60 * 60 * 1000).toISOString();
  const { data: customers, error } = await supabase
    .from('customer_profiles')
    .select('id, tiktok_handle, status, last_history_sync_at, last_upload_at')
    .in('status', ['active', 'agreed', 'invited'])
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

  const result = {
    processed, imported, statsUpdated, errors, callsUsed,
    budgetRemaining: Math.max(0, dailyBudget - priorCallsToday - callsUsed),
    budgetExceeded, staleLocksCleared,
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
  });
  if (cronLogError) {
    logger.warn({ err: cronLogError.message }, 'cron_run_log insert failed (non-fatal)');
  }

  return result;
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
