export interface TikTokProfilePreview {
  handle: string;
  canonical_url: string;
  author_name: string | null;
  author_url: string | null;
  title: string | null;
}

function normalizeHandle(value: string): string | null {
  const normalized = value.trim().replace(/^@/, '');
  return normalized || null;
}

export function deriveTikTokHandle(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith('http')) {
    try {
      const url = new URL(trimmed);
      const match = url.pathname.match(/^\/@?([^/?&#]+)/);
      return match ? normalizeHandle(match[1] ?? '') : null;
    } catch {
      return null;
    }
  }

  return normalizeHandle(trimmed);
}

export function toCanonicalTikTokProfileUrl(input: string): string | null {
  const handle = deriveTikTokHandle(input);
  return handle ? `https://www.tiktok.com/@${handle}` : null;
}

export async function fetchTikTokProfilePreview(
  input: string
): Promise<TikTokProfilePreview> {
  const canonicalUrl = toCanonicalTikTokProfileUrl(input);
  if (!canonicalUrl) {
    throw new Error('Ogiltig TikTok-profil. Använd en profil-URL eller @handle.');
  }

  const oembedUrl = new URL('https://www.tiktok.com/oembed');
  oembedUrl.searchParams.set('url', canonicalUrl);

  const response = await fetch(oembedUrl.toString(), {
    headers: {
      'user-agent': 'Mozilla/5.0',
    },
    redirect: 'follow',
    signal: AbortSignal.timeout(10_000),
  });

  if (response.status === 404) {
    throw new Error('TikTok-profilen hittades inte.');
  }

  if (!response.ok) {
    throw new Error(`TikTok svarade med ${response.status}.`);
  }

  const payload = (await response.json()) as {
    author_name?: unknown;
    author_url?: unknown;
    title?: unknown;
  };

  const authorUrl =
    typeof payload.author_url === 'string' && payload.author_url.trim()
      ? payload.author_url.trim()
      : canonicalUrl;
  const handle = deriveTikTokHandle(authorUrl) ?? deriveTikTokHandle(canonicalUrl);

  if (!handle) {
    throw new Error('Kunde inte verifiera TikTok-profilen.');
  }

  return {
    handle,
    canonical_url: `https://www.tiktok.com/@${handle}`,
    author_name:
      typeof payload.author_name === 'string' && payload.author_name.trim()
        ? payload.author_name.trim()
        : null,
    author_url: authorUrl,
    title:
      typeof payload.title === 'string' && payload.title.trim()
        ? payload.title.trim()
        : null,
  };
}
