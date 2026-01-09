import { NextRequest, NextResponse } from 'next/server';

/**
 * Lightweight TikTok Profile Fetcher
 *
 * Fetches public profile data from TikTok using OG meta tags.
 * No API key required - just scrapes what's publicly visible.
 *
 * GET /api/tiktok-profile/mellowcafe
 * GET /api/tiktok-profile/@mellowcafe
 */

interface TikTokProfileRaw {
  handle: string;
  displayName: string | null;
  bio: string | null;
  avatarUrl: string | null;
  // These require JS rendering - will be null from OG tags
  followers: string | null;
  following: string | null;
  likes: string | null;
  videoCount: string | null;
  // Meta
  fetchedAt: string;
  source: 'og_tags' | 'api' | 'manual';
}

// Parse OG meta tags from HTML
function parseOgTags(html: string): Record<string, string> {
  const ogTags: Record<string, string> = {};

  // Match <meta property="og:xxx" content="yyy">
  const ogRegex = /<meta\s+property="og:([^"]+)"\s+content="([^"]*)"/gi;
  let match;
  while ((match = ogRegex.exec(html)) !== null) {
    ogTags[match[1]] = match[2];
  }

  // Also try reversed order: content before property
  const ogRegex2 = /<meta\s+content="([^"]*)"\s+property="og:([^"]+)"/gi;
  while ((match = ogRegex2.exec(html)) !== null) {
    ogTags[match[2]] = match[1];
  }

  return ogTags;
}

// Try to extract follower count from page (might be in JSON-LD or script tags)
function tryExtractStats(html: string): { followers?: string; likes?: string; videoCount?: string } {
  const stats: { followers?: string; likes?: string; videoCount?: string } = {};

  // TikTok sometimes includes stats in a script tag with __UNIVERSAL_DATA_FOR_REHYDRATION__
  const dataMatch = html.match(/"followerCount":(\d+)/);
  if (dataMatch) {
    stats.followers = formatCount(parseInt(dataMatch[1]));
  }

  const likesMatch = html.match(/"heartCount":(\d+)/);
  if (likesMatch) {
    stats.likes = formatCount(parseInt(likesMatch[1]));
  }

  const videoMatch = html.match(/"videoCount":(\d+)/);
  if (videoMatch) {
    stats.videoCount = videoMatch[1];
  }

  return stats;
}

// Format number to Swedish style: 12400 → "12,4K"
function formatCount(num: number): string {
  if (num >= 1000000) {
    return (num / 1000000).toFixed(1).replace('.', ',') + 'M';
  }
  if (num >= 1000) {
    return (num / 1000).toFixed(1).replace('.', ',') + 'K';
  }
  return num.toString();
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ handle: string }> }
) {
  const { handle: rawHandle } = await params;

  // Clean handle (remove @ if present)
  const handle = rawHandle.replace(/^@/, '');

  if (!handle || handle.length < 2) {
    return NextResponse.json(
      { error: 'Invalid handle' },
      { status: 400 }
    );
  }

  try {
    // Fetch public profile page
    const profileUrl = `https://www.tiktok.com/@${handle}`;
    const response = await fetch(profileUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      },
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: `Profile not found or inaccessible (${response.status})` },
        { status: response.status }
      );
    }

    const html = await response.text();

    // Parse OG tags
    const ogTags = parseOgTags(html);

    // Try to extract stats from embedded JSON
    const stats = tryExtractStats(html);

    // Build profile from OG tags
    // og:title is usually "displayName (@handle) | TikTok"
    let displayName: string | null = null;
    if (ogTags['title']) {
      const titleMatch = ogTags['title'].match(/^(.+?)\s*\(@/);
      if (titleMatch) {
        displayName = titleMatch[1].trim();
      }
    }

    const profile: TikTokProfileRaw = {
      handle: `@${handle}`,
      displayName: displayName,
      bio: ogTags['description'] || null,
      avatarUrl: ogTags['image'] || null,
      followers: stats.followers || null,
      following: null, // Not available from OG tags
      likes: stats.likes || null,
      videoCount: stats.videoCount || null,
      fetchedAt: new Date().toISOString(),
      source: 'og_tags',
    };

    return NextResponse.json({
      success: true,
      profile,
      _debug: {
        ogTags,
        statsFound: Object.keys(stats).length > 0,
      },
    });

  } catch (error) {
    console.error('TikTok profile fetch error:', error);
    return NextResponse.json(
      {
        error: 'Failed to fetch profile',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
