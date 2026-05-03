import { unstable_cache } from 'next/cache';
import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/api-auth';
import {
  deriveTikTokHandle,
  fetchTikTokProfilePreview,
  toCanonicalTikTokProfileUrl,
} from '@/lib/tiktok/profile';

function buildCachedTikTokPreview(input: string) {
  const canonicalUrl = toCanonicalTikTokProfileUrl(input);
  const handle = deriveTikTokHandle(input);

  if (!canonicalUrl || !handle) {
    return null;
  }

  return unstable_cache(
    async () => fetchTikTokProfilePreview(canonicalUrl),
    ['admin-tiktok-profile-preview', canonicalUrl],
    {
      revalidate: 60 * 60 * 24,
      tags: [`tiktok:${handle}`],
    },
  );
}

export const GET = withAuth(
  async (request: NextRequest) => {
    const input = request.nextUrl.searchParams.get('input')?.trim() ?? '';
    if (!input) {
      return NextResponse.json({ error: 'TikTok-profil krävs.' }, { status: 400 });
    }

    const cachedLoader = buildCachedTikTokPreview(input);
    if (!cachedLoader) {
      return NextResponse.json(
        { error: 'Ogiltig TikTok-profil. Använd en profil-URL eller @handle.' },
        { status: 400 },
      );
    }

    try {
      const preview = await cachedLoader();
      return NextResponse.json({ preview });
    } catch (error) {
      return NextResponse.json(
        {
          error:
            error instanceof Error
              ? error.message
              : 'Kunde inte verifiera TikTok-profilen.',
        },
        { status: 400 },
      );
    }
  },
  ['admin'],
);
