import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/api-auth';
import { createSupabaseAdmin } from '@/lib/server/supabase-admin';
import { logInteraction } from '@/lib/interactions';
import {
  importNewClips,
  partitionHistoryClips,
} from '@/lib/studio/history-import';
import type { NormalizedHistoryClip } from '@/lib/studio/tiktok-provider';

interface HagenLibraryVideo {
  video_url?: string;
  metadata?: Record<string, unknown>;
  rated_at?: string;
  created_at?: string;
}

type HagenImportClip = NormalizedHistoryClip & {
  source_username: string | null;
};

function normHandle(value: string): string {
  return value.toLowerCase().replace(/^@/, '').trim();
}

function extractTikTokVideoId(url: string): string | null {
  const match = url.match(/\/video\/([^/?#]+)/i);
  return match?.[1] ?? null;
}

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function buildMatchingClips(params: {
  libVideos: HagenLibraryVideo[];
  normalizedHandle: string;
}): HagenImportClip[] {
  const observedAt = new Date().toISOString();

  return params.libVideos
    .filter((video) => {
      if (typeof video.video_url !== 'string') return false;

      const author = ((video.metadata ?? {}).author ?? {}) as Record<string, unknown>;
      const username =
        typeof author.username === 'string' ? author.username
        : typeof author.displayName === 'string' ? author.displayName
        : '';

      return normHandle(username).includes(params.normalizedHandle);
    })
    .map((video) => {
      const metadata = video.metadata ?? {};
      const author = (metadata.author ?? {}) as Record<string, unknown>;
      const stats = (metadata.stats ?? {}) as Record<string, unknown>;
      const sourceUsername =
        typeof author.username === 'string' && author.username ? author.username
        : typeof author.displayName === 'string' && author.displayName ? author.displayName
        : null;
      const tiktokUrl = video.video_url!.trim();

      return {
        tiktok_url: tiktokUrl,
        tiktok_thumbnail_url:
          typeof metadata.thumbnail_url === 'string' ? metadata.thumbnail_url : null,
        tiktok_views: asNumber(stats.views),
        tiktok_likes: asNumber(stats.likes),
        tiktok_comments: asNumber(stats.comments),
        description: typeof metadata.title === 'string' ? metadata.title : null,
        published_at:
          typeof metadata.createdAt === 'string' ? metadata.createdAt
          : typeof video.rated_at === 'string' ? video.rated_at
          : typeof video.created_at === 'string' ? video.created_at
          : null,
        history_source: 'hagen_library',
        observed_profile_handle: params.normalizedHandle,
        provider_name: 'hagen:video-library',
        provider_video_id: extractTikTokVideoId(tiktokUrl),
        first_observed_at: observedAt,
        last_observed_at: observedAt,
        source_username: sourceUsername,
      };
    });
}

export const POST = withAuth(
  async (
    request: NextRequest,
    user,
    { params }: { params: Promise<{ customerId: string }> }
  ) => {
    const { customerId } = await params;
    const isPreview = new URL(request.url).searchParams.get('preview') === 'true';
    const supabase = createSupabaseAdmin();

    const { data: profile, error: profileError } = await supabase
      .from('customer_profiles')
      .select('tiktok_handle')
      .eq('id', customerId)
      .single();

    if (profileError || !profile) {
      return NextResponse.json({ error: 'Customer profile not found' }, { status: 404 });
    }

    const rawHandle = (profile as { tiktok_handle?: string | null }).tiktok_handle;
    if (!rawHandle?.trim()) {
      return NextResponse.json(
        { error: 'tiktok_handle is not set on this customer profile' },
        { status: 400 }
      );
    }

    const handle = rawHandle.trim();
    const normalizedHandle = normHandle(handle);

    const hagenBase = process.env.HAGEN_BASE_URL;
    if (!hagenBase) {
      return NextResponse.json({ error: 'HAGEN_BASE_URL is not configured' }, { status: 503 });
    }

    let libVideos: HagenLibraryVideo[];
    try {
      const response = await fetch(`${hagenBase}/api/videos/library?all=true&platform=tiktok`, {
        signal: AbortSignal.timeout(8000),
      });

      if (!response.ok) {
        return NextResponse.json(
          { error: `hagen library returned ${response.status}` },
          { status: 502 },
        );
      }

      const payload = (await response.json()) as { videos?: HagenLibraryVideo[] };
      libVideos = payload.videos ?? [];
    } catch (error) {
      return NextResponse.json(
        { error: `Could not reach hagen at ${hagenBase}: ${(error as Error).message}` },
        { status: 502 },
      );
    }

    const matchingClips = buildMatchingClips({
      libVideos,
      normalizedHandle,
    });
    const partitioned = await partitionHistoryClips(supabase, customerId, matchingClips);

    if (isPreview) {
      const samples = partitioned.newClips
        .slice(0, 3)
        .map((clip) => {
          const previewClip = clip as HagenImportClip;
          return {
            tiktok_url: previewClip.tiktok_url,
            source_username: previewClip.source_username,
            description: previewClip.description,
          };
        });

      let availableUsernames: string[] | undefined;
      if (matchingClips.length === 0 && libVideos.length > 0) {
        const seen = new Set<string>();

        for (const video of libVideos) {
          const author = ((video.metadata ?? {}).author ?? {}) as Record<string, unknown>;
          const raw =
            typeof author.username === 'string' && author.username ? author.username
            : typeof author.displayName === 'string' && author.displayName ? author.displayName
            : null;

          if (raw) {
            const normalized = raw.toLowerCase().replace(/^@/, '').trim();
            if (normalized) seen.add(normalized);
          }

          if (seen.size >= 20) break;
        }

        availableUsernames = [...seen];
      }

      return NextResponse.json({
        preview: true,
        handle,
        wouldImport: partitioned.newClips.length,
        wouldSkip: partitioned.skipped,
        totalMatched: matchingClips.length,
        samples,
        ...(availableUsernames !== undefined && { availableUsernames }),
      });
    }

    if (matchingClips.length === 0) {
      return NextResponse.json({
        imported: 0,
        skipped: 0,
        message: `No clips found in hagen for handle "${handle}"`,
      });
    }

    const importResult = await importNewClips(supabase, customerId, matchingClips);
    const importedUrls = partitioned.newClips.map((clip) => clip.tiktok_url);

    let slots: Array<{ id: string; feed_order: number | null; tiktok_url: string | null }> = [];
    if (importedUrls.length > 0) {
      const { data: insertedRows } = await supabase
        .from('customer_concepts')
        .select('id, feed_order, tiktok_url')
        .eq('customer_profile_id', customerId)
        .eq('history_source', 'hagen_library')
        .in('tiktok_url', importedUrls)
        .order('feed_order', { ascending: true });

      slots = (insertedRows ?? []) as Array<{
        id: string;
        feed_order: number | null;
        tiktok_url: string | null;
      }>;
    }

    await logInteraction({
      type: 'tiktok_upload_synced',
      cmProfileId: typeof user === 'object' && user && 'id' in user ? String(user.id) : null,
      customerId,
      metadata: {
        imported: importResult.imported,
        skipped: importResult.skipped,
        preview: false,
        source: 'hagen_library',
      },
      client: supabase,
    });

    return NextResponse.json({
      imported: importResult.imported,
      skipped: importResult.skipped,
      slots,
    });
  },
  ['admin', 'content_manager']
);
