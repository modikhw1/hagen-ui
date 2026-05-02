import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/api-auth';
import { fetchTikTokProfilePreview } from '@/lib/tiktok/profile';

export const GET = withAuth(
  async (request: NextRequest) => {
    const input = request.nextUrl.searchParams.get('input')?.trim() ?? '';
    if (!input) {
      return NextResponse.json({ error: 'TikTok-profil krävs.' }, { status: 400 });
    }

    try {
      const preview = await fetchTikTokProfilePreview(input);
      return NextResponse.json({ preview });
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : 'Kunde inte verifiera TikTok-profilen.' },
        { status: 400 }
      );
    }
  },
  ['admin', 'content_manager']
);
