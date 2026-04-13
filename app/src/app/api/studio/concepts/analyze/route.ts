import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/api-auth';

type JsonRecord = Record<string, unknown>;

function normalizeBaseUrl(value: string) {
  return value.endsWith('/') ? value.slice(0, -1) : value;
}

async function readResponsePayload(response: Response): Promise<{
  data: JsonRecord | null;
  text: string | null;
}> {
  const contentType = response.headers.get('content-type') || '';

  if (contentType.includes('application/json')) {
    const data = (await response.json().catch(() => null)) as JsonRecord | null;
    return { data, text: null };
  }

  const text = await response.text().catch(() => null);
  return { data: null, text: text?.trim() || null };
}

function extractErrorMessage(
  payload: { data: JsonRecord | null; text: string | null },
  fallback: string,
) {
  const preferredMessage = payload.data?.message;
  if (typeof preferredMessage === 'string' && preferredMessage.trim()) {
    return preferredMessage.trim();
  }

  const genericError = payload.data?.error;
  if (typeof genericError === 'string' && genericError.trim()) {
    return genericError.trim();
  }

  if (payload.text) {
    return payload.text;
  }

  return fallback;
}

export const POST = withAuth(
  async (request: NextRequest) => {
    const hagenBaseUrl = process.env.HAGEN_BASE_URL?.trim();
    if (!hagenBaseUrl) {
      return NextResponse.json(
        { error: 'Analystjansten ar inte konfigurerad. Satt HAGEN_BASE_URL pa servern.' },
        { status: 503 },
      );
    }

    const body = await request.json().catch(() => ({}));
    const videoUrl = typeof body?.videoUrl === 'string' ? body.videoUrl.trim() : '';
    const platform = typeof body?.platform === 'string' ? body.platform.trim() : '';

    if (!videoUrl) {
      return NextResponse.json({ error: 'videoUrl is required' }, { status: 400 });
    }

    const baseUrl = normalizeBaseUrl(hagenBaseUrl);

    try {
      const createResponse = await fetch(`${baseUrl}/api/videos/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: videoUrl }),
        signal: AbortSignal.timeout(30000),
      });

      const createPayload = await readResponsePayload(createResponse);
      if (!createResponse.ok) {
        return NextResponse.json(
          {
            error: extractErrorMessage(createPayload, 'Videoregistreringen misslyckades hos analystjansten.'),
            stage: 'create',
            details: createPayload.data,
          },
          { status: createResponse.status },
        );
      }

      const createData = createPayload.data;
      if (!createData || typeof createData.id !== 'string' || !createData.id.trim()) {
        return NextResponse.json(
          {
            error: 'Analystjansten returnerade inte videoId efter create-steget.',
            stage: 'create',
            details: createData,
          },
          { status: 502 },
        );
      }

      const deepResponse = await fetch(`${baseUrl}/api/videos/analyze/deep`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          videoId: createData.id,
        }),
        signal: AbortSignal.timeout(120000),
      });

      const deepPayload = await readResponsePayload(deepResponse);
      if (!deepResponse.ok) {
        return NextResponse.json(
          {
            error: extractErrorMessage(deepPayload, 'Djupanalysen misslyckades hos analystjansten.'),
            stage: 'deep-analyze',
            details: deepPayload.data,
          },
          { status: deepResponse.status },
        );
      }

      if (!deepPayload.data) {
        return NextResponse.json(
          {
            error: 'Analystjansten returnerade ett ogiltigt svar.',
            stage: 'deep-analyze',
          },
          { status: 502 },
        );
      }

      return NextResponse.json({
        success: true,
        analysis: {
          ...deepPayload.data,
          videoId: createData.id,
        },
      });
    } catch (error) {
      const message =
        error instanceof Error && error.name === 'TimeoutError'
          ? 'Analysen tog for lang tid. Forsok igen om en stund.'
          : 'Kunde inte na analystjansten. Kontrollera serverkonfiguration och backendstatus.';

      return NextResponse.json(
        {
          error: message,
          stage: 'network',
        },
        { status: 502 },
      );
    }
  },
  ['admin', 'content_manager'],
);
