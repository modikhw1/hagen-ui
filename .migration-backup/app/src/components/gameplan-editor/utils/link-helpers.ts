export type LinkPlatform = 'tiktok' | 'instagram' | 'youtube' | 'article' | 'external';

const LINK_PLATFORMS: ReadonlyArray<LinkPlatform> = ['tiktok', 'instagram', 'youtube', 'article', 'external'];

const PLATFORM_LABELS: Record<LinkPlatform, string> = {
  tiktok: 'TikTok',
  instagram: 'Instagram',
  youtube: 'YouTube',
  article: 'Artikel',
  external: 'Lank',
};

export function isLinkPlatform(value: string | null | undefined): value is LinkPlatform {
  if (!value) return false;
  return LINK_PLATFORMS.includes(value as LinkPlatform);
}

export function toLinkPlatform(value: string | null | undefined): LinkPlatform {
  return isLinkPlatform(value) ? value : 'external';
}

export function getLinkPlatformLabel(platform: LinkPlatform): string {
  return PLATFORM_LABELS[platform];
}

export function detectLinkType(url: string): LinkPlatform {
  const normalized = normalizeHref(url);
  if (!normalized) return 'external';
  if (/tiktok\.com/i.test(normalized)) return 'tiktok';
  if (/instagram\.com/i.test(normalized)) return 'instagram';
  if (/youtube\.com|youtu\.be/i.test(normalized)) return 'youtube';
  if (/^mailto:/i.test(normalized)) return 'external';

  try {
    const { protocol } = new URL(normalized);
    if (protocol === 'http:' || protocol === 'https:') return 'article';
  } catch {
    return 'external';
  }

  return 'external';
}

export function normalizeHref(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (/^(https?:\/\/|mailto:)/i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

export function getYoutubeVideoId(url: string): string | null {
  const match = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([A-Za-z0-9_-]{11})/i);
  return match?.[1] || null;
}

export function getHostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

// Legacy helper kept for backward compatibility with existing rendered chips.
export function getLinkThumbnail(url: string, type: LinkPlatform): string {
  if (type === 'youtube') {
    const id = getYoutubeVideoId(url);
    if (id) return `https://img.youtube.com/vi/${id}/mqdefault.jpg`;
  }
  if (type === 'instagram') {
    return 'https://www.instagram.com/static/images/ico/favicon-192.png/68d99ba29cc8.png';
  }
  if (type === 'tiktok') return 'https://www.tiktok.com/favicon.ico';

  const host = getHostname(url);
  if (host) return `https://www.google.com/s2/favicons?sz=128&domain=${encodeURIComponent(host)}`;
  return 'https://www.google.com/s2/favicons?sz=128&domain=example.com';
}
