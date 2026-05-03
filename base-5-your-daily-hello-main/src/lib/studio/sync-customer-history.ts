import { createSupabaseAdmin } from '@/lib/server/supabase-admin';
import { logInteraction } from '@/lib/interactions';
import { autoReconcileAndAdvance } from '@/lib/studio/auto-reconcile';
import { importNewClips, updateClipStats } from '@/lib/studio/history-import';
import {
  createMotorSignalNudge,
  inferMotorSignalKind,
} from '@/lib/studio/motor-signal';
import {
  fetchProviderVideos,
  fetchProviderUser,
  normalizeVideo,
  type NormalizedHistoryClip,
} from '@/lib/studio/tiktok-provider';
import type { TablesInsert, TablesUpdate } from '@/types/database';

type SupabaseAdmin = ReturnType<typeof createSupabaseAdmin>;

const DEFAULT_SYNC_COUNT = 10;
const LOCK_WINDOW_MS = 2 * 60 * 1000;

export interface SyncOptions {
  cursor?: number;
  count?: number;
  mode: 'cron' | 'manual' | 'mark_produced';
  suppressAutoReconcile?: boolean;
}

export interface SyncResult {
  fetched: number;
  imported: number;
  statsUpdated: number;
  reconciled: boolean;
  has_more: boolean;
  cursor: number | null;
  error?: string;
  nudgeCreated?: boolean;
}

function extractVideoIdFromUrl(url: string): string | null {
  const match = url.match(/\/video\/([^/?#]+)/i);
  return match?.[1] ?? null;
}

function isMissingOperationLockColumn(message: string): boolean {
  const lower = message.toLowerCase();
  return lower.includes('operation_lock_until') && lower.includes('does not exist');
}

async function updateSyncRun(
  supabase: SupabaseAdmin,
  runId: string | null,
  patch: TablesUpdate<'sync_runs'>
): Promise<void> {
  if (!runId) return;

  const { error } = await supabase
    .from('sync_runs')
    .update(patch)
    .eq('id', runId);

  if (error) {
    console.error('[syncCustomerHistory] failed to update sync_run:', error.message);
  }
}

function buildNormalizedClips(
  videos: Array<Parameters<typeof normalizeVideo>[0]>,
  handle: string
): NormalizedHistoryClip[] {
  const observedAt = new Date().toISOString();
  const clips: NormalizedHistoryClip[] = [];

  for (const video of videos) {
    const clip = normalizeVideo(video, handle);
    if (!clip) continue;

    clips.push({
      ...clip,
      first_observed_at: clip.first_observed_at ?? observedAt,
      last_observed_at: observedAt,
    });
  }

  return clips;
}

async function persistTikTokAdminData(
  supabase: SupabaseAdmin,
  customerId: string,
  clips: NormalizedHistoryClip[],
  currentFollowers: number
): Promise<void> {
  if (clips.length === 0 && currentFollowers === 0) {
    return;
  }

  const latestPublishedAt = clips.reduce<string | null>((max, clip) => {
    if (!clip.published_at) return max;
    if (!max) return clip.published_at;
    return clip.published_at > max ? clip.published_at : max;
  }, null);

  const videos = clips
    .map((clip) => {
      const videoId = extractVideoIdFromUrl(clip.tiktok_url);
      if (!videoId || !clip.published_at) return null;

      return {
        customer_profile_id: customerId,
        video_id: videoId,
        uploaded_at: clip.published_at,
        views: clip.tiktok_views ?? 0,
        likes: clip.tiktok_likes ?? 0,
        comments: clip.tiktok_comments ?? 0,
        shares: 0,
        cover_image_url: clip.tiktok_thumbnail_url,
        share_url: clip.tiktok_url,
        raw_payload: {
          provider: 'rapidapi:tiktok-scraper7',
          description: clip.description,
        },
      };
    })
    .filter((video): video is NonNullable<typeof video> => video !== null);

  if (videos.length > 0) {
    const { error: videoError } = await supabase
      .from('tiktok_videos')
      .upsert(videos, { onConflict: 'customer_profile_id,video_id' });

    if (videoError) {
      throw new Error(videoError.message);
    }

    const { error: publicationError } = await supabase
      .from('tiktok_publications')
      .upsert(
        videos.map((video) => ({
          customer_id: customerId,
          tiktok_video_id: video.video_id,
          published_at: video.uploaded_at,
        })),
        { onConflict: 'customer_id,tiktok_video_id' },
      );

    if (publicationError) {
      throw new Error(publicationError.message);
    }
  }

  const cutoff24h = Date.now() - 86_400_000;
  const last24h = clips.filter((clip) => {
    if (!clip.published_at) return false;
    return new Date(clip.published_at).getTime() >= cutoff24h;
  });
  const totalViews = clips.reduce((sum, clip) => sum + (clip.tiktok_views ?? 0), 0);
  const totalLikes = clips.reduce((sum, clip) => sum + (clip.tiktok_likes ?? 0), 0);
  const totalViews24h = last24h.reduce((sum, clip) => sum + (clip.tiktok_views ?? 0), 0);
  const engagementRate =
    clips.length > 0 ? Number(((totalLikes / Math.max(1, totalViews)) * 100).toFixed(2)) : 0;

  const { error: statsError } = await supabase
    .from('tiktok_stats')
    .upsert(
      {
        customer_profile_id: customerId,
        snapshot_date: new Date().toISOString().slice(0, 10),
        followers: currentFollowers,
        total_videos: clips.length,
        videos_last_24h: last24h.length,
        total_views_24h: totalViews24h,
        engagement_rate: engagementRate,
        raw_payload: {
          provider: 'rapidapi:tiktok-scraper7',
          clip_count: clips.length,
        },
      },
      { onConflict: 'customer_profile_id,snapshot_date' },
    );

  if (statsError) {
    throw new Error(statsError.message);
  }

  if (latestPublishedAt) {
    const { error: customerError } = await supabase
      .from('customer_profiles')
      .update({ last_upload_at: latestPublishedAt })
      .eq('id', customerId);

    if (customerError) {
      throw new Error(customerError.message);
    }
  }
}

export async function syncCustomerHistory(
  supabase: SupabaseAdmin,
  customerId: string,
  handle: string,
  rapidApiKey: string,
  opts: SyncOptions
): Promise<SyncResult> {
  const now = new Date();
  const startedAt = now.toISOString();
  const count = opts.count ?? DEFAULT_SYNC_COUNT;
  const lockUntil = new Date(now.getTime() + LOCK_WINDOW_MS).toISOString();

  let lockAcquired = false;
  let syncRunId: string | null = null;
  let statsUpdated = 0;
  let imported = 0;
  let reconciled = false;
  let nudgeCreated = false;
  let fetched = 0;
  let hasMore = false;
  let nextCursor: number | null = opts.cursor ?? null;
  let isInitialHistorySync = false;

  try {
    const { data: lockRows, error: lockError } = await supabase
      .from('customer_profiles')
      .update({ operation_lock_until: lockUntil })
      .eq('id', customerId)
      .or(`operation_lock_until.is.null,operation_lock_until.lt.${startedAt}`)
      .select('id, last_history_sync_at');

    if (lockError) {
      if (isMissingOperationLockColumn(lockError.message)) {
        console.warn('[syncCustomerHistory] operation_lock_until unavailable, continuing without lock');
        const { data: currentProfile, error: currentProfileError } = await supabase
          .from('customer_profiles')
          .select('last_history_sync_at')
          .eq('id', customerId)
          .maybeSingle();

        if (currentProfileError) {
          throw new Error(currentProfileError.message);
        }

        isInitialHistorySync = !currentProfile?.last_history_sync_at;
      } else {
        throw new Error(lockError.message);
      }
    } else {
      if (!lockRows || lockRows.length === 0) {
        return {
          fetched: 0,
          imported: 0,
          statsUpdated: 0,
          reconciled: false,
          has_more: false,
          cursor: opts.cursor ?? null,
          error: 'already_locked',
        };
      }

      lockAcquired = true;
      isInitialHistorySync = !lockRows[0]?.last_history_sync_at;
    }

    const { data: syncRun, error: syncRunError } = await supabase
      .from('sync_runs')
      .insert({
        customer_id: customerId,
        mode: opts.mode,
        started_at: startedAt,
        status: 'running',
      } satisfies TablesInsert<'sync_runs'>)
      .select('id')
      .single();

    if (syncRunError) {
      throw new Error(syncRunError.message);
    }

    syncRunId = syncRun.id as string;

    // Hämta både videos och profil-info (för att få followerCount)
    const [providerResult, userResult] = await Promise.all([
      fetchProviderVideos(handle, rapidApiKey, count, opts.cursor),
      fetchProviderUser(handle, rapidApiKey)
    ]);

    if (providerResult.error) {
      throw new Error(providerResult.error);
    }

    const followers = userResult.stats?.followerCount ?? 0;
    const profilePic = userResult.user?.avatarMedium;

    hasMore = providerResult.has_more;
    nextCursor = providerResult.cursor;

    const clips = buildNormalizedClips(providerResult.videos, handle);
    fetched = clips.length;

    if (providerResult.videos.length > 0 && clips.length === 0) {
      throw new Error(
        `normalization_failure: ${providerResult.videos.length} video(s) all failed normalization`
      );
    }

    await persistTikTokAdminData(supabase, customerId, clips, followers);
    statsUpdated = await updateClipStats(supabase, customerId, clips);
    
    // Uppdatera profilbild om vi fick en ny
    if (profilePic) {
      await supabase
        .from('customer_profiles')
        .update({ tiktok_profile_pic_url: profilePic })
        .eq('id', customerId);
    }

    const importResult = await importNewClips(supabase, customerId, clips);
    imported = importResult.imported;

    if (
      imported > 0 &&
      opts.cursor === undefined &&
      !isInitialHistorySync &&
      !opts.suppressAutoReconcile
    ) {
      const reconcileResult = await autoReconcileAndAdvance(supabase, customerId);
      reconciled = reconcileResult.advanced;
    }

    if (imported > 0) {
      const signalId = await createMotorSignalNudge(supabase, customerId, {
        imported_count: imported,
        latest_published_at: importResult.latestImportedPublishedAt,
        kind: inferMotorSignalKind(importResult.latestImportedPublishedAt),
      });
      nudgeCreated = Boolean(signalId);
    }

    const finishedAt = new Date().toISOString();

    const { error: stampError } = await supabase
      .from('customer_profiles')
      .update({ last_history_sync_at: finishedAt })
      .eq('id', customerId);

    if (stampError) {
      throw new Error(stampError.message);
    }

    await updateSyncRun(supabase, syncRunId, {
      finished_at: finishedAt,
      status: 'ok',
      fetched_count: fetched,
      imported_count: imported,
      stats_updated_count: statsUpdated,
      reconciled,
      error: null,
    });

    const { data: customerProfile } = await supabase
      .from('customer_profiles')
      .select('account_manager_profile_id')
      .eq('id', customerId)
      .maybeSingle();

    await logInteraction({
      type: 'tiktok_upload_synced',
      cmProfileId: customerProfile?.account_manager_profile_id ?? null,
      customerId,
      client: supabase as never,
      metadata: {
        mode: opts.mode,
        fetched,
        imported,
        statsUpdated,
        reconciled,
      },
    });

    return {
      fetched,
      imported,
      statsUpdated,
      reconciled,
      has_more: hasMore,
      cursor: nextCursor,
      nudgeCreated,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    await updateSyncRun(supabase, syncRunId, {
      finished_at: new Date().toISOString(),
      status: 'error',
      fetched_count: fetched,
      imported_count: imported,
      stats_updated_count: statsUpdated,
      reconciled,
      error: message,
    });

    throw error;
  } finally {
    if (lockAcquired) {
      const { error: unlockError } = await supabase
        .from('customer_profiles')
        .update({ operation_lock_until: null })
        .eq('id', customerId);

      if (unlockError) {
        console.error('[syncCustomerHistory] failed to clear lock:', unlockError.message);
      }
    }
  }
}
