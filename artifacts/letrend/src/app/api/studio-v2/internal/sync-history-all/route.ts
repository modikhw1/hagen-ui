import { NextRequest, NextResponse } from 'next/server';
import { runHistorySyncBatch } from '@/lib/studio/run-history-sync-batch';

function getCronSecret() {
  return process.env.CRON_SECRET || process.env.VERCEL_CRON_SECRET || '';
}

export const POST = async (request: NextRequest): Promise<NextResponse> => {
  const cronSecret = getCronSecret();
  if (!cronSecret) {
    return NextResponse.json({ error: 'CRON_SECRET ar inte konfigurerad.' }, { status: 503 });
  }

  const authHeader = request.headers.get('authorization') ?? '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (token !== cronSecret) {
    return NextResponse.json({ error: 'Obehorig.' }, { status: 401 });
  }

  const rapidApiKey = process.env.RAPIDAPI_KEY;
  if (!rapidApiKey) {
    return NextResponse.json({ error: 'RAPIDAPI_KEY ar inte konfigurerad.' }, { status: 503 });
  }

  const delayMs = parseInt(process.env.TIKTOK_DELAY_MS ?? '500', 10);
  try {
    return NextResponse.json(
      await runHistorySyncBatch({
        rapidApiKey,
        delayMs,
      }),
    );
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Kunde inte genomfora TikTok-synk.',
      },
      { status: 500 },
    );
  }
};
