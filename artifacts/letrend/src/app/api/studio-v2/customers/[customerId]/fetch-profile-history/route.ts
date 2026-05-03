import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/api-auth';
import { createSupabaseAdmin } from '@/lib/server/supabase-admin';
import { fetchFullProfileHistory } from '@/lib/studio/fetch-full-profile-history';
import { recoverProfileHistoryFromCache } from '@/lib/studio/recover-profile-history-from-cache';
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
    let fetchFullHistory = false;

    try {
      const body = (await request.json()) as { count?: unknown; cursor?: unknown; full?: unknown };
      if (typeof body?.count === 'number' && body.count > 0) {
        fetchCount = Math.min(Math.floor(body.count), MAX_FETCH_COUNT);
      }
      if (typeof body?.cursor === 'number') {
        fetchCursor = body.cursor;
      }
      if (body?.full === true) {
        fetchFullHistory = true;
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
      const result = fetchFullHistory
        ? await fetchFullProfileHistory({
            supabase,
            customerId,
            handle,
            rapidApiKey,
          })
        : await syncCustomerHistory(supabase, customerId, handle, rapidApiKey, {
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
        stats_updated: 'statsUpdated' in result ? result.statsUpdated : result.stats_updated,
        reconciled: result.reconciled,
        has_more: result.has_more,
        cursor: result.cursor,
        ...('pages' in result ? { pages: result.pages } : {}),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      if (fetchFullHistory && message.includes('returned 429')) {
        const recovered = await recoverProfileHistoryFromCache({
          supabase,
          customerId,
          handle,
        });

        if (recovered.recovered) {
          return NextResponse.json({
            fetched: recovered.fetched,
            imported: recovered.imported,
            skipped: recovered.skipped,
            stats_updated: 0,
            reconciled: false,
            has_more: false,
            cursor: null,
            recovered_from_cache: true,
          });
        }
      }

      return NextResponse.json(
        { error: `Kunde inte na TikTok-providern: ${message}` },
        { status: 502 },
      );
    }
  },
  ['admin', 'content_manager'],
);
