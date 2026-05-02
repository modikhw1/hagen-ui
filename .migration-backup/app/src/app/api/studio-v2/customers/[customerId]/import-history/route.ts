import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/api-auth';
import { createSupabaseAdmin } from '@/lib/server/supabase-admin';
import {
  createMotorSignalNudge,
  inferMotorSignalKind,
} from '@/lib/studio/motor-signal';
import { renumberImportedRows } from '@/lib/studio/history-import';

interface TikTokClipInput {
  tiktok_url: string;
  tiktok_thumbnail_url?: string | null;
  thumbnail_url?: string | null;
  tiktok_views?: number | null;
  tiktok_likes?: number | null;
  tiktok_comments?: number | null;
  description?: string | null;
  published_at?: string | null;
}

export const POST = withAuth(
  async (
    request: NextRequest,
    _user: unknown,
    { params }: { params: Promise<{ customerId: string }> }
  ) => {
    const { customerId } = await params;
    const body = await request.json().catch(() => ({}));
    const { clips, replace = false } = body as {
      clips: TikTokClipInput[];
      replace?: boolean;
    };

    if (!Array.isArray(clips) || clips.length === 0) {
      return NextResponse.json({ error: 'clips must be a non-empty array' }, { status: 400 });
    }

    const validClips = clips.filter(
      (clip): clip is TikTokClipInput =>
        typeof clip.tiktok_url === 'string' && clip.tiktok_url.trim() !== ''
    );
    if (validClips.length === 0) {
      return NextResponse.json({ error: 'No clips with valid tiktok_url provided' }, { status: 400 });
    }

    const supabase = createSupabaseAdmin();

    if (replace) {
      await supabase
        .from('customer_concepts')
        .delete()
        .eq('customer_profile_id', customerId)
        .is('concept_id', null)
        .lt('feed_order', 0);
    } else {
      const { data: existing } = await supabase
        .from('customer_concepts')
        .select('tiktok_url')
        .eq('customer_profile_id', customerId)
        .not('tiktok_url', 'is', null);

      const existingUrls = new Set((existing ?? []).map((row) => row.tiktok_url as string));
      const before = validClips.length;
      const dedupedClips = validClips.filter((clip) => !existingUrls.has(clip.tiktok_url.trim()));

      if (dedupedClips.length === 0) {
        return NextResponse.json({ imported: 0, skipped: before, message: 'All clips already present' });
      }

      return insertClips(supabase, customerId, dedupedClips, false, before - dedupedClips.length);
    }

    return insertClips(supabase, customerId, validClips, replace, 0);
  },
  ['admin', 'content_manager']
);

async function insertClips(
  supabase: ReturnType<typeof import('@/lib/server/supabase-admin').createSupabaseAdmin>,
  customerId: string,
  clips: TikTokClipInput[],
  replace: boolean,
  skipped: number
): Promise<NextResponse> {
  const { data: existingHistory } = await supabase
    .from('customer_concepts')
    .select('feed_order')
    .eq('customer_profile_id', customerId)
    .lt('feed_order', 0)
    .order('feed_order', { ascending: true })
    .limit(1);

  const currentMostNegative = existingHistory?.[0]?.feed_order ?? 0;
  const tempStartOrder = replace ? -1 : Math.min(currentMostNegative - 1, -1);

  const sortedClips = [...clips].sort((a, b) => {
    if (!a.published_at && !b.published_at) return 0;
    if (!a.published_at) return 1;
    if (!b.published_at) return -1;
    return new Date(b.published_at).getTime() - new Date(a.published_at).getTime();
  });

  const inserts = sortedClips.map((clip, index) => ({
    customer_profile_id: customerId,
    customer_id: customerId,
    concept_id: null,
    status: 'produced',
    feed_order: tempStartOrder - index,
    tiktok_url: clip.tiktok_url.trim(),
    tiktok_thumbnail_url: clip.tiktok_thumbnail_url ?? clip.thumbnail_url ?? null,
    tiktok_views: clip.tiktok_views ?? null,
    tiktok_likes: clip.tiktok_likes ?? null,
    tiktok_comments: clip.tiktok_comments ?? null,
    published_at: clip.published_at ?? null,
    tags: [] as string[],
    content_overrides: clip.description ? { script: clip.description } : {},
  }));

  const { data: insertedRows, error } = await supabase
    .from('customer_concepts')
    .insert(inserts)
    .select('id, tiktok_url');

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await renumberImportedRows(supabase, customerId);

  const { data: renumberedRows } = await supabase
    .from('customer_concepts')
    .select('id, feed_order, tiktok_url')
    .eq('customer_profile_id', customerId)
    .is('concept_id', null)
    .is('reconciled_customer_concept_id', null)
    .not('feed_order', 'is', null)
    .order('feed_order', { ascending: false });

  const importedCount = insertedRows?.length ?? 0;
  const insertedIds = new Set((insertedRows ?? []).map((row) => row.id as string));
  const finalSlots = (renumberedRows ?? [])
    .filter((row) => insertedIds.has(row.id as string))
    .map((row) => ({
      id: row.id,
      tiktok_url: row.tiktok_url,
      feed_order: row.feed_order,
    }));

  if (importedCount > 0) {
    const latestPublishedAt = sortedClips[0]?.published_at ?? null;
    await createMotorSignalNudge(supabase, customerId, {
      imported_count: importedCount,
      latest_published_at: latestPublishedAt,
      kind: inferMotorSignalKind(latestPublishedAt),
    });
  }

  return NextResponse.json({
    imported: importedCount,
    skipped,
    slots: finalSlots,
  });
}
