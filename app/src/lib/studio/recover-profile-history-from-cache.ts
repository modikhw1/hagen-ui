import 'server-only';

import { createSupabaseAdmin } from '@/lib/server/supabase-admin';
import { importNewClips } from '@/lib/studio/history-import';
import type { NormalizedHistoryClip } from '@/lib/studio/tiktok-provider';

type SupabaseAdmin = ReturnType<typeof createSupabaseAdmin>;

type CachedVideoRow = {
  video_id: string;
  uploaded_at: string;
  views: number | null;
  likes: number | null;
  comments: number | null;
  cover_image_url: string | null;
  share_url: string | null;
  raw_payload: unknown;
};

export type CachedHistoryRecoveryResult = {
  recovered: boolean;
  fetched: number;
  imported: number;
  skipped: number;
};

function readDescription(rawPayload: unknown): string | null {
  if (!rawPayload || typeof rawPayload !== 'object') {
    return null;
  }

  const value = (rawPayload as { description?: unknown }).description;
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export async function recoverProfileHistoryFromCache(params: {
  supabase: SupabaseAdmin;
  customerId: string;
  handle: string;
}): Promise<CachedHistoryRecoveryResult> {
  const { data, error } = await params.supabase
    .from('tiktok_videos')
    .select(
      'video_id, uploaded_at, views, likes, comments, cover_image_url, share_url, raw_payload',
    )
    .eq('customer_profile_id', params.customerId)
    .order('uploaded_at', { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  const rows = (data ?? []) as CachedVideoRow[];
  if (rows.length === 0) {
    return {
      recovered: false,
      fetched: 0,
      imported: 0,
      skipped: 0,
    };
  }

  const clips: NormalizedHistoryClip[] = rows
    .filter((row) => typeof row.share_url === 'string' && row.share_url.trim() !== '')
    .map((row) => ({
      tiktok_url: row.share_url as string,
      tiktok_thumbnail_url: row.cover_image_url,
      tiktok_views: row.views,
      tiktok_likes: row.likes,
      tiktok_comments: row.comments,
      published_at: row.uploaded_at,
      description: readDescription(row.raw_payload),
      history_source: 'tiktok_profile',
      observed_profile_handle: params.handle,
      provider_name: 'rapidapi:tiktok-scraper7',
      provider_video_id: row.video_id,
      first_observed_at: row.uploaded_at,
      last_observed_at: new Date().toISOString(),
    }));

  if (clips.length === 0) {
    return {
      recovered: false,
      fetched: rows.length,
      imported: 0,
      skipped: rows.length,
    };
  }

  const result = await importNewClips(params.supabase, params.customerId, clips);

  return {
    recovered: result.imported > 0 || result.skipped > 0,
    fetched: clips.length,
    imported: result.imported,
    skipped: result.skipped,
  };
}
