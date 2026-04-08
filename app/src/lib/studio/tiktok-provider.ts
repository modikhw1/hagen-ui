// ─────────────────────────────────────────────────────────────────────────────
// Provider: RapidAPI / tiktok-scraper7 (tikwm-tikwm-default)
//
// Shared fetch + normalization logic extracted from the per-customer
// fetch-profile-history route so that the automatic sync-history-all
// route can call the same provider without duplicating provider-specific code.
//
// To swap providers: replace fetchProviderVideos(), normalizeVideo(), and the
// types below only. Everything else is product logic and must not change.
//
// Subscribe: https://rapidapi.com/tikwm-tikwm-default/api/tiktok-scraper7 (free tier)
// Env var: RAPIDAPI_KEY
//
// Response shape verified from live call 2026-04-07:
//   { code: 0, data: { videos: [...], cursor: number, has_more: boolean } }
//   v.video_id       — numeric string, used for TikTok URL construction
//   v.title          — caption (may be empty string)
//   v.cover          — thumbnail URL (top-level)
//   v.origin_cover   — higher-res thumbnail (top-level, preferred)
//   v.create_time    — unix seconds (snake_case)
//   v.play_count     — views (flat, snake_case)
//   v.digg_count     — likes (flat, snake_case)
//   v.comment_count  — comments (flat, snake_case)
// ─────────────────────────────────────────────────────────────────────────────

export interface NormalizedHistoryClip {
  tiktok_url: string;
  tiktok_thumbnail_url: string | null;
  tiktok_views: number | null;
  tiktok_likes: number | null;
  tiktok_comments: number | null;
  published_at: string | null;
  description: string | null;
}

export interface Scraper7Video {
  video_id?: string;
  title?: string;
  cover?: string;
  origin_cover?: string;
  create_time?: number;
  play_count?: number;
  digg_count?: number;
  comment_count?: number;
}

interface Scraper7Response {
  code?: number;
  data?: {
    videos?: Scraper7Video[];
    cursor?: number;
    has_more?: boolean;
  };
}

export function normalizeVideo(v: Scraper7Video, handle: string): NormalizedHistoryClip | null {
  if (!v.video_id) return null;

  const thumbnail =
    (typeof v.origin_cover === 'string' && v.origin_cover ? v.origin_cover : null) ??
    (typeof v.cover === 'string' && v.cover ? v.cover : null);

  const publishedAt =
    typeof v.create_time === 'number' && v.create_time > 0
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
  };
}

export async function fetchProviderVideos(
  handle: string,
  apiKey: string,
  count: number,
  cursor?: number
): Promise<{ videos: Scraper7Video[]; has_more: boolean; cursor: number | null; error?: string }> {
  const RAPIDAPI_HOST = 'tiktok-scraper7.p.rapidapi.com';
  const url = new URL(`https://${RAPIDAPI_HOST}/user/posts`);
  url.searchParams.set('unique_id', handle);
  url.searchParams.set('count', String(count));
  if (cursor !== undefined) url.searchParams.set('cursor', String(cursor));

  const res = await fetch(url.toString(), {
    headers: {
      'x-rapidapi-key': apiKey,
      'x-rapidapi-host': RAPIDAPI_HOST,
    },
    signal: AbortSignal.timeout(15000),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    return {
      videos: [],
      has_more: false,
      cursor: null,
      error: `tiktok-scraper7 returned ${res.status}${body ? `: ${body.slice(0, 200)}` : ''}`,
    };
  }

  const data = (await res.json()) as Scraper7Response;

  if (data.code !== 0) {
    return { videos: [], has_more: false, cursor: null, error: `tiktok-scraper7 response code ${data.code}` };
  }

  return {
    videos: data.data?.videos ?? [],
    has_more: data.data?.has_more ?? false,
    cursor: data.data?.cursor ?? null,
  };
}
