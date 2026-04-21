import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/api-auth';
import { createSupabaseAdmin } from '@/lib/server/supabase-admin';
import { syncCustomerHistory } from '@/lib/studio/sync-customer-history';

const DEFAULT_FETCH_COUNT = 10;
const MAX_FETCH_COUNT = 50;

export const POST = withAuth(
  async (
    request: NextRequest,
    _user: unknown,
    { params }: { params: Promise<{ customerId: string }> },
  ) => {
    const { customerId } = await params;
    const supabase = createSupabaseAdmin();

    let fetchCount = DEFAULT_FETCH_COUNT;
    let fetchCursor: number | undefined;

    try {
      const body = (await request.json()) as { count?: unknown; cursor?: unknown };
      if (typeof body?.count === 'number' && body.count > 0) {
        fetchCount = Math.min(Math.floor(body.count), MAX_FETCH_COUNT);
      }
      if (typeof body?.cursor === 'number') {
        fetchCursor = body.cursor;
      }
    } catch {
      // No body or invalid JSON, use defaults.
    }

    const { data: profile, error: profileError } = await supabase
      .from('customer_profiles')
      .select('tiktok_profile_url, tiktok_handle')
      .eq('id', customerId)
      .single();

    if (profileError || !profile) {
      return NextResponse.json({ error: 'Kundprofilen hittades inte.' }, { status: 404 });
    }

    const { tiktok_profile_url, tiktok_handle } = profile as {
      tiktok_profile_url?: string | null;
      tiktok_handle?: string | null;
    };

    if (!tiktok_handle?.trim()) {
      return NextResponse.json(
        {
          error: tiktok_profile_url
            ? 'Kunde inte harleda en TikTok-handle fran den sparade profil-URL:en.'
            : 'TikTok-profil saknas pa kunden.',
        },
        { status: 400 },
      );
    }

    const rapidApiKey = process.env.RAPIDAPI_KEY;
    if (!rapidApiKey) {
      return NextResponse.json({ error: 'RAPIDAPI_KEY ar inte konfigurerad.' }, { status: 503 });
    }

    const handle = tiktok_handle.trim().replace(/^@/, '');

    try {
      const result = await syncCustomerHistory(supabase, customerId, handle, rapidApiKey, {
        mode: 'manual',
        cursor: fetchCursor,
        count: fetchCount,
      });

      if (result.error === 'already_locked') {
        return NextResponse.json(
          { error: 'Historiksynk pagar redan for kunden.' },
          { status: 409 },
        );
      }

      return NextResponse.json({
        fetched: result.fetched,
        imported: result.imported,
        skipped: Math.max(result.fetched - result.imported, 0),
        stats_updated: result.statsUpdated,
        reconciled: result.reconciled,
        has_more: result.has_more,
        cursor: result.cursor,
      });
    } catch (error) {
      return NextResponse.json(
        { error: `Kunde inte na TikTok-providern: ${(error as Error).message}` },
        { status: 502 },
      );
    }
  },
  ['admin', 'content_manager'],
);
