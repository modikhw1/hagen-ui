import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/api-auth';
import { logInteraction } from '@/lib/interactions';
import { createSupabaseAdmin } from '@/lib/server/supabase-admin';
import type { TablesUpdate } from '@/types/database';
import { fetchCustomerTikTokRuntime } from '@/lib/tiktok/customer-runtime';
import { buildTikTokProfileLinkPatch } from '@/lib/tiktok/customer-profile-link';
import { triggerInitialTikTokSync } from '@/lib/tiktok/trigger-initial-sync';

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
      .select('*')
      .eq('id', customerId)
      .single();

    const runtime = await fetchCustomerTikTokRuntime({
      customerId,
      supabase,
    });

    if (error || !data || !runtime.profile) {
      return NextResponse.json({ error: 'Kundprofilen hittades inte.' }, { status: 404 });
    }

    return NextResponse.json({
      ...data,
      tiktok_runtime: runtime,
    });
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
    const { data: currentProfile, error: currentProfileError } = await supabase
      .from('customer_profiles')
      .select('tiktok_profile_url, last_history_sync_at')
      .eq('id', customerId)
      .maybeSingle();

    if (currentProfileError) {
      return NextResponse.json(
        { error: 'Kunde inte lasa befintlig TikTok-profil.' },
        { status: 500 },
      );
    }

    if ('tiktok_profile_url' in body) {
      const raw = typeof body.tiktok_profile_url === 'string' ? body.tiktok_profile_url : null;
      const profilePatch = buildTikTokProfileLinkPatch({
        input: raw,
        previousProfileUrl:
          typeof currentProfile?.tiktok_profile_url === 'string'
            ? currentProfile.tiktok_profile_url
            : null,
      });

      if (!profilePatch.ok) {
        return NextResponse.json(
          { error: 'Ogiltig TikTok-profil. Anvand en profil-URL eller @handle.' },
          { status: 400 },
        );
      }

      Object.assign(patch, profilePatch.patch);
    }

    if ('tiktok_handle' in body && !('tiktok_profile_url' in body)) {
      const rawHandle =
        typeof body.tiktok_handle === 'string' && body.tiktok_handle.trim() !== ''
          ? `@${body.tiktok_handle.trim().replace(/^@/, '')}`
          : null;
      const profilePatch = buildTikTokProfileLinkPatch({
        input: rawHandle,
        previousProfileUrl:
          typeof currentProfile?.tiktok_profile_url === 'string'
            ? currentProfile.tiktok_profile_url
            : null,
      });

      if (!profilePatch.ok) {
        return NextResponse.json(
          { error: 'Ogiltig TikTok-profil. Anvand en profil-URL eller @handle.' },
          { status: 400 },
        );
      }

      Object.assign(patch, profilePatch.patch);
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

    await triggerInitialTikTokSync({
      supabaseAdmin: supabase,
      customerId,
      tiktokHandle: typeof patch.tiktok_handle === 'string' ? patch.tiktok_handle : null,
      lastHistorySyncAt:
        typeof currentProfile?.last_history_sync_at === 'string'
          ? currentProfile.last_history_sync_at
          : null,
      source: 'profile_link',
    });

    const requestUser = (request as NextRequest & {
      user?: { id?: string | null };
    }).user;
    const cmProfileId = requestUser?.id ?? null;

    await logInteraction({
      type: 'customer_updated',
      cmProfileId,
      customerId,
      metadata: { updates: Object.keys(patch) },
      client: supabase,
    });

    return NextResponse.json({ ok: true, patched: Object.keys(patch) });
  },
  ['admin', 'content_manager'],
);
