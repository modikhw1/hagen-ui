import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/api-auth';
import { createSupabaseAdmin } from '@/lib/server/supabase-admin';

// ─────────────────────────────────────────────
// GET  /api/studio-v2/customers/[customerId]/profile
// PATCH /api/studio-v2/customers/[customerId]/profile
//
// Thin read/update for select customer_profiles fields.
//
// Patchable fields:
//   tiktok_profile_url — canonical TikTok profile identity (e.g. https://www.tiktok.com/@brand)
//                        Saving this also derives and stores tiktok_handle.
//   tiktok_handle      — direct handle override (if set without profile_url)
// ─────────────────────────────────────────────

/**
 * Derive a normalized TikTok handle from a profile URL or bare handle string.
 * - "https://www.tiktok.com/@brandname" → "brandname"
 * - "@brandname" → "brandname"
 * - "brandname" → "brandname"
 * Returns null if nothing usable is found.
 */
function deriveTikTokHandle(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith('http')) {
    try {
      const url = new URL(trimmed);
      const match = url.pathname.match(/^\/@?([^/?&#]+)/);
      return match ? match[1] : null;
    } catch {
      return null;
    }
  }

  // Bare handle: @brandname or brandname
  const bare = trimmed.replace(/^@/, '').trim();
  return bare || null;
}

export const GET = withAuth(
  async (
    _request: NextRequest,
    _user: unknown,
    { params }: { params: Promise<{ customerId: string }> }
  ) => {
    const { customerId } = await params;
    const supabase = createSupabaseAdmin();

    const { data, error } = await supabase
      .from('customer_profiles')
      .select('id, tiktok_profile_url, tiktok_handle, last_history_sync_at, pending_history_advance, pending_history_advance_seen_at, pending_history_advance_published_at')
      .eq('id', customerId)
      .single();

    if (error || !data) {
      return NextResponse.json({ error: 'Customer profile not found' }, { status: 404 });
    }

    return NextResponse.json(data);
  },
  ['admin', 'content_manager']
);

export const PATCH = withAuth(
  async (
    request: NextRequest,
    _user: unknown,
    { params }: { params: Promise<{ customerId: string }> }
  ) => {
    const { customerId } = await params;
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const supabase = createSupabaseAdmin();

    const patch: Record<string, string | null> = {};

    // Motor signal acknowledgement: CM dismissed the nudge without advancing the plan.
    // Sets pending_history_advance_seen_at = NOW() so the nudge is suppressed on reload.
    // pending_history_advance is kept intact — evidence is still present.
    if (body.acknowledge_advance_cue === true) {
      const { error: ackError } = await supabase
        .from('customer_profiles')
        .update({ pending_history_advance_seen_at: new Date().toISOString() })
        .eq('id', customerId);
      if (ackError) {
        return NextResponse.json({ error: ackError.message }, { status: 500 });
      }
      return NextResponse.json({ ok: true, patched: ['pending_history_advance_seen_at'] });
    }

    // tiktok_profile_url: store canonical URL and derive handle from it
    if ('tiktok_profile_url' in body) {
      const raw = body.tiktok_profile_url;
      const url = typeof raw === 'string' && raw.trim() !== '' ? raw.trim() : null;
      patch.tiktok_profile_url = url;
      if (url) {
        const handle = deriveTikTokHandle(url);
        patch.tiktok_handle = handle;
      }
    }

    // tiktok_handle: direct override (no URL normalization)
    if ('tiktok_handle' in body && !('tiktok_profile_url' in body)) {
      const val = body.tiktok_handle;
      patch.tiktok_handle = typeof val === 'string' && val.trim() !== '' ? val.trim().replace(/^@/, '') : null;
    }

    if (Object.keys(patch).length === 0) {
      return NextResponse.json(
        { error: 'Patchable fields: tiktok_profile_url, tiktok_handle, acknowledge_advance_cue' },
        { status: 400 }
      );
    }

    const { error } = await supabase
      .from('customer_profiles')
      .update(patch)
      .eq('id', customerId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, patched: Object.keys(patch) });
  },
  ['admin', 'content_manager']
);
