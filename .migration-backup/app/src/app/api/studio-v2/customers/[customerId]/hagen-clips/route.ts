import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/api-auth';

// ─────────────────────────────────────────────
// GET /api/studio-v2/customers/[customerId]/hagen-clips
//
// Fetches TikTok clips from the hagen analyzed_videos library and returns
// them shaped for the import-history textarea/route.
//
// Uses ?all=true&platform=tiktok on the hagen library endpoint so both rated
// and unrated TikTok clips are included (hagen library defaults to rated-only).
//
// Requires HAGEN_BASE_URL env var pointing to the running hagen instance
// (e.g. http://localhost:3001). Returns 503 if not configured, 502 if
// hagen is unreachable.
// ─────────────────────────────────────────────

interface HagenLibraryVideo {
  video_url?: string;
  platform?: string;
  metadata?: Record<string, unknown>;
  rated_at?: string;
  created_at?: string;
}

export const GET = withAuth(
  async (
    request: NextRequest,
    _user: unknown,
    { params }: { params: Promise<{ customerId: string }> }
  ) => {
    await params; // customerId not used — library is global across hagen

    // Optional ?username=<handle> — filter clips to a specific TikTok account.
    // Case-insensitive, strips leading @, substring match.
    const usernameFilter = new URL(request.url).searchParams.get('username') ?? null;
    const normHandle = (s: string) => s.toLowerCase().replace(/^@/, '').trim();

    const hagenBase = process.env.HAGEN_BASE_URL;
    if (!hagenBase) {
      return NextResponse.json(
        { error: 'HAGEN_BASE_URL is not configured' },
        { status: 503 }
      );
    }

    let libData: { videos?: HagenLibraryVideo[] };
    try {
      // all=true: include unrated clips (hagen library defaults to rated-only).
      // platform=tiktok: server-side filter so hagen returns only TikTok rows.
      const res = await fetch(`${hagenBase}/api/videos/library?all=true&platform=tiktok`, {
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) {
        return NextResponse.json(
          { error: `hagen library returned ${res.status}` },
          { status: 502 }
        );
      }
      libData = (await res.json()) as { videos?: HagenLibraryVideo[] };
    } catch (err) {
      return NextResponse.json(
        { error: `Could not reach hagen at ${hagenBase}: ${(err as Error).message}` },
        { status: 502 }
      );
    }

    const videos = libData.videos ?? [];

    // hagen already filtered to platform=tiktok server-side; guard on video_url.
    // Uses thumbnail_url (hagen metadata field) — accepted by the import route
    // as an alias for tiktok_thumbnail_url.
    const clips = videos
      .filter((v) => typeof v.video_url === 'string')
      .map((v) => {
        const meta = v.metadata ?? {};
        const stats = (meta.stats ?? {}) as Record<string, unknown>;
        const author = (meta.author ?? {}) as Record<string, unknown>;
        // Prefer username (unique handle), fall back to displayName
        const sourceUsername =
          typeof author.username === 'string' && author.username
            ? author.username
            : typeof author.displayName === 'string' && author.displayName
            ? author.displayName
            : null;
        return {
          tiktok_url: v.video_url as string,
          source_username: sourceUsername,
          thumbnail_url: typeof meta.thumbnail_url === 'string' ? meta.thumbnail_url : null,
          tiktok_views: typeof stats.views === 'number' ? stats.views : null,
          tiktok_likes: typeof stats.likes === 'number' ? stats.likes : null,
          tiktok_comments: typeof stats.comments === 'number' ? stats.comments : null,
          description: typeof meta.title === 'string' ? meta.title : null,
          // published_at: prefer metadata.createdAt, then rated_at, then created_at
          published_at:
            typeof meta.createdAt === 'string'
              ? meta.createdAt
              : typeof v.rated_at === 'string'
              ? v.rated_at
              : typeof v.created_at === 'string'
              ? v.created_at
              : null,
        };
      });

    // Apply optional username filter (case-insensitive, strip @, substring match)
    const filteredClips = usernameFilter
      ? clips.filter((c) => {
          if (!c.source_username) return false;
          return normHandle(c.source_username).includes(normHandle(usernameFilter));
        })
      : clips;

    return NextResponse.json({ clips: filteredClips, total: filteredClips.length });
  },
  ['admin', 'content_manager']
);
