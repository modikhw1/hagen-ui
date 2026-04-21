import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/api-auth';
import { createSupabaseAdmin } from '@/lib/server/supabase-admin';
import type { TablesUpdate } from '@/types/database';
import {
  deriveTikTokHandle,
  toCanonicalTikTokProfileUrl,
} from '@/lib/tiktok/profile';

export const GET = withAuth(
  async (
    _request: NextRequest,
    _user: unknown,
    { params }: { params: Promise<{ customerId: string }> },
  ) => {
    const { customerId } = await params;
    const supabase = createSupabaseAdmin();

    const { data, error } = await supabase
      .from('customer_profiles')
      .select('id, tiktok_profile_url, tiktok_handle, last_history_sync_at, pending_history_advance_at')
      .eq('id', customerId)
      .single();

    if (error || !data) {
      return NextResponse.json({ error: 'Kundprofilen hittades inte.' }, { status: 404 });
    }

    return NextResponse.json(data);
  },
  ['admin', 'content_manager'],
);

export const PATCH = withAuth(
  async (
    request: NextRequest,
    _user: unknown,
    { params }: { params: Promise<{ customerId: string }> },
  ) => {
    const { customerId } = await params;
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const supabase = createSupabaseAdmin();
    const patch: TablesUpdate<'customer_profiles'> = {};

    if ('tiktok_profile_url' in body) {
      const raw = body.tiktok_profile_url;
      const url = typeof raw === 'string' && raw.trim() !== '' ? raw.trim() : null;

      patch.tiktok_profile_url = url ? toCanonicalTikTokProfileUrl(url) : null;
      patch.tiktok_handle = url ? deriveTikTokHandle(url) : null;
      patch.tiktok_user_id = null;

      if (url && (!patch.tiktok_profile_url || !patch.tiktok_handle)) {
        return NextResponse.json(
          { error: 'Ogiltig TikTok-profil. Anvand en profil-URL eller @handle.' },
          { status: 400 },
        );
      }
    }

    if ('tiktok_handle' in body && !('tiktok_profile_url' in body)) {
      const value = body.tiktok_handle;
      patch.tiktok_handle =
        typeof value === 'string' && value.trim() !== ''
          ? value.trim().replace(/^@/, '')
          : null;
    }

    if (Object.keys(patch).length === 0) {
      return NextResponse.json(
        { error: 'Uppdateringsbara falt: tiktok_profile_url, tiktok_handle.' },
        { status: 400 },
      );
    }

    const { error } = await supabase
      .from('customer_profiles')
      .update(patch)
      .eq('id', customerId);

    if (error) {
      return NextResponse.json(
        { error: 'Kunde inte uppdatera TikTok-profilen.' },
        { status: 500 },
      );
    }

    return NextResponse.json({ ok: true, patched: Object.keys(patch) });
  },
  ['admin', 'content_manager'],
);
