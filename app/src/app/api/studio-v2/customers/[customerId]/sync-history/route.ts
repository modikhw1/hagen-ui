import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/api-auth';
import { createSupabaseAdmin } from '@/lib/server/supabase-admin';
import { logInteraction } from '@/lib/interactions';
import {
  createMotorSignalNudge,
  inferMotorSignalKind,
} from '@/lib/studio/motor-signal';

// ─────────────────────────────────────────────
// POST /api/studio-v2/customers/[customerId]/sync-history
//
// One-click history sync:
//   1. Reads customer_profiles.tiktok_handle for this customer
//   2. Fetches all TikTok clips from hagen (?all=true&platform=tiktok)
//   3. Filters to clips whose source username matches the handle
//   4. Deduplicates against existing customer_concepts.tiktok_url
//   5. Inserts new clips as imported_history rows (negative feed_order)
//   6. Updates customer_profiles.last_history_sync_at = NOW()
//
// ?preview=true — dry-run mode:
//   Runs steps 1–4 only. Does NOT insert rows or update last_history_sync_at.
//   Returns { preview: true, handle, wouldImport, wouldSkip, samples }.
//   samples: up to 3 clips with tiktok_url, source_username, description.
//
// Returns { imported, skipped } summary (real mode).
// Requires HAGEN_BASE_URL env var.
// ─────────────────────────────────────────────

interface HagenLibraryVideo {
  video_url?: string;
  metadata?: Record<string, unknown>;
  rated_at?: string;
  created_at?: string;
}

/** Strip leading @ and lowercase for fuzzy handle comparison */
function normHandle(s: string): string {
  return s.toLowerCase().replace(/^@/, '').trim();
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

    // ── 1. Read tiktok_handle ──────────────────────────────────────────
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

    // ── 2. Fetch from hagen ────────────────────────────────────────────
    const hagenBase = process.env.HAGEN_BASE_URL;
    if (!hagenBase) {
      return NextResponse.json({ error: 'HAGEN_BASE_URL is not configured' }, { status: 503 });
    }

    let libVideos: HagenLibraryVideo[];
    try {
      const res = await fetch(`${hagenBase}/api/videos/library?all=true&platform=tiktok`, {
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) {
        return NextResponse.json({ error: `hagen library returned ${res.status}` }, { status: 502 });
      }
      const libData = (await res.json()) as { videos?: HagenLibraryVideo[] };
      libVideos = libData.videos ?? [];
    } catch (err) {
      return NextResponse.json(
        { error: `Could not reach hagen at ${hagenBase}: ${(err as Error).message}` },
        { status: 502 }
      );
    }

    // ── 3. Filter by handle + map to import shape ──────────────────────
    const matchingClips = libVideos
      .filter((v) => {
        if (typeof v.video_url !== 'string') return false;
        const author = ((v.metadata ?? {}).author ?? {}) as Record<string, unknown>;
        const username =
          typeof author.username === 'string' ? author.username
          : typeof author.displayName === 'string' ? author.displayName
          : '';
        return normHandle(username).includes(normalizedHandle);
      })
      .map((v) => {
        const meta = v.metadata ?? {};
        const stats = (meta.stats ?? {}) as Record<string, unknown>;
        const author = (meta.author ?? {}) as Record<string, unknown>;
        return {
          tiktok_url: (v.video_url as string).trim(),
          tiktok_thumbnail_url:
            typeof meta.thumbnail_url === 'string' ? meta.thumbnail_url : null,
          tiktok_views: typeof stats.views === 'number' ? stats.views : null,
          tiktok_likes: typeof stats.likes === 'number' ? stats.likes : null,
          tiktok_comments: typeof stats.comments === 'number' ? stats.comments : null,
          description: typeof meta.title === 'string' ? meta.title : null,
          published_at:
            typeof meta.createdAt === 'string' ? meta.createdAt
            : typeof v.rated_at === 'string' ? v.rated_at
            : typeof v.created_at === 'string' ? v.created_at
            : null,
          source_username:
            typeof author.username === 'string' && author.username ? author.username
            : typeof author.displayName === 'string' ? author.displayName
            : null,
        };
      });

    // ── 4. Deduplicate against existing tiktok_url ────────────────────
    const { data: existing } = await supabase
      .from('customer_concepts')
      .select('tiktok_url')
      .eq('customer_profile_id', customerId)
      .not('tiktok_url', 'is', null);

    const existingUrls = new Set((existing ?? []).map((r) => r.tiktok_url as string));
    const newClips = matchingClips.filter((c) => !existingUrls.has(c.tiktok_url));
    const skipped = matchingClips.length - newClips.length;

    // ── Preview / dry-run: return without writing ──────────────────────
    if (isPreview) {
      const samples = newClips.slice(0, 3).map((c) => ({
        tiktok_url: c.tiktok_url,
        source_username: c.source_username,
        description: c.description,
      }));

      // When the handle matched nothing, surface unique source usernames
      // from the full hagen clip pool so the CM can diagnose what handle
      // forms are actually stored and adjust accordingly.
      let availableUsernames: string[] | undefined;
      if (matchingClips.length === 0 && libVideos.length > 0) {
        const seen = new Set<string>();
        for (const v of libVideos) {
          const author = ((v.metadata ?? {}).author ?? {}) as Record<string, unknown>;
          const raw =
            typeof author.username === 'string' && author.username ? author.username
            : typeof author.displayName === 'string' && author.displayName ? author.displayName
            : null;
          if (raw) {
            const normalized = raw.toLowerCase().replace(/^@/, '').trim();
            if (normalized) seen.add(normalized);
          }
          if (seen.size >= 20) break; // cap at 20 unique handles
        }
        availableUsernames = [...seen];
      }

      return NextResponse.json({
        preview: true,
        handle,
        wouldImport: newClips.length,
        wouldSkip: skipped,
        totalMatched: matchingClips.length,
        samples,
        ...(availableUsernames !== undefined && { availableUsernames }),
      });
    }

    // Always update last_history_sync_at, even if no clips found
    const stampSync = () =>
      supabase
        .from('customer_profiles')
        .update({ last_history_sync_at: new Date().toISOString() })
        .eq('id', customerId);

    if (matchingClips.length === 0) {
      await stampSync();
      return NextResponse.json({
        imported: 0,
        skipped: 0,
        message: `No clips found in hagen for handle "${handle}"`,
      });
    }

    if (newClips.length === 0) {
      await stampSync();
      return NextResponse.json({ imported: 0, skipped, message: 'All clips already present' });
    }

    // ── 5. Find current most-negative feed_order ──────────────────────
    const { data: historySlots } = await supabase
      .from('customer_concepts')
      .select('feed_order')
      .eq('customer_profile_id', customerId)
      .lt('feed_order', 0)
      .order('feed_order', { ascending: true })
      .limit(1);

    const currentMostNegative = historySlots?.[0]?.feed_order ?? 0;
    const startOrder = Math.min(currentMostNegative - 1, -1);

    // ── 6. Insert new imported_history rows ───────────────────────────
    const inserts = newClips.map((clip, i) => ({
      customer_profile_id: customerId,
      customer_id: customerId,
      concept_id: null,
      status: 'produced',
      feed_order: startOrder - i,
      tiktok_url: clip.tiktok_url,
      tiktok_thumbnail_url: clip.tiktok_thumbnail_url,
      tiktok_views: clip.tiktok_views,
      tiktok_likes: clip.tiktok_likes,
      tiktok_comments: clip.tiktok_comments,
      published_at: clip.published_at,
      tags: [] as string[],
      content_overrides: clip.description ? { script: clip.description } : {},
    }));

    const { data: inserted, error: insertError } = await supabase
      .from('customer_concepts')
      .insert(inserts)
      .select('id, feed_order, tiktok_url');

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    // ── 7. Stamp sync time and persist motor signal ───────────────────
    const importedCount = inserted?.length ?? 0;
    // Compute MAX(published_at) of newly imported clips for the freshness seam.
    const latestPublishedAt = newClips.reduce<string | null>((max, c) => {
      if (!c.published_at) return max;
      if (!max) return c.published_at;
      return c.published_at > max ? c.published_at : max;
    }, null);
    await supabase
      .from('customer_profiles')
      .update({ last_history_sync_at: new Date().toISOString() })
      .eq('id', customerId);

    if (importedCount > 0) {
      await createMotorSignalNudge(supabase, customerId, {
        imported_count: importedCount,
        latest_published_at: latestPublishedAt,
        kind: inferMotorSignalKind(latestPublishedAt),
      });
    }

    await logInteraction({
      type: 'tiktok_upload_synced',
      cmProfileId: typeof user === 'object' && user && 'id' in user ? String(user.id) : null,
      customerId,
      metadata: {
        imported: importedCount,
        skipped,
        preview: false,
      },
      client: supabase,
    });

    return NextResponse.json({
      imported: importedCount,
      skipped,
      slots: inserted,
    });
  },
  ['admin', 'content_manager']
);
