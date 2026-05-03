import 'server-only';

import { createSupabaseAdmin } from '@/lib/server/supabase-admin';
import { unstable_cache } from 'next/cache';

const RAPIDAPI_PLATFORM_GQL = 'https://platform-api.p.rapidapi.com/graphql';

export interface RapidApiQuota {
  service: string;
  used: number;
  limit: number;
  reset_at: string | null;
  debug_msg?: string;
}

/**
 * Reads the last successful quota from the service_quotas table.
 */
async function fetchLastKnownQuotaFromDb(service: string): Promise<RapidApiQuota | null> {
  try {
    const supabase = createSupabaseAdmin();
    const { data, error } = await ((supabase
      .from('service_quotas' as never)) as any)
      .select('used, limit, reset_at')
      .eq('service', service)
      .maybeSingle();

    if (error || !data) return null;

    return {
      service,
      used: Number(data.used),
      limit: Number(data.limit),
      reset_at: data.reset_at,
      debug_msg: 'FROM_DB'
    };
  } catch (e) {
    return null;
  }
}

/**
 * Fallback: Fetches quotas by making a minimal TikTok API call and reading headers.
 */
async function fetchQuotaFromHeaders(prefix = ''): Promise<RapidApiQuota[]> {
  const apiKey = process.env.RAPIDAPI_KEY;
  const TIKTOK_SERVICE_NAME = 'TikTok Fetcher';
  if (!apiKey) return [];

  const RAPIDAPI_HOST = 'tiktok-scraper7.p.rapidapi.com';
  // Use a more obscure string than 'tiktok' to avoid global rate limits on common probes
  const url = `https://${RAPIDAPI_HOST}/user/info?unique_id=vaynermedia`;

  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'x-rapidapi-key': apiKey,
        'x-rapidapi-host': RAPIDAPI_HOST,
      },
      cache: 'no-store',
      signal: AbortSignal.timeout(20000), // Increase to 20s
    });

    if (res.status === 429) {
      console.warn('[RapidAPI Quota] Header fallback rate limited (429), attempting DB fallback...');
      const dbFallback = await fetchLastKnownQuotaFromDb(TIKTOK_SERVICE_NAME);
      return [{ ...(dbFallback || {
        service: TIKTOK_SERVICE_NAME,
        used: 0,
        limit: 0,
        reset_at: null,
      }), debug_msg: `${prefix ? prefix + '_' : ''}H_429` }];
    }

    const limit = res.headers.get('x-ratelimit-requests-limit') ?? res.headers.get('x-ratelimit-scraping-api-limit');
    const remaining = res.headers.get('x-ratelimit-requests-remaining') ?? res.headers.get('x-ratelimit-scraping-api-remaining');

    if (limit && remaining) {
      const used = Number(limit) - Number(remaining);
      const quota: RapidApiQuota = {
        service: TIKTOK_SERVICE_NAME,
        used: used,
        limit: Number(limit),
        reset_at: null,
        debug_msg: `${prefix ? prefix + '_' : ''}HDR_OK`
      };

      // Attempt to persist if table exists
      try {
        const supabase = createSupabaseAdmin();
        await ((supabase.from('service_quotas' as never)) as any).upsert({
          service: quota.service,
          used: quota.used,
          limit: quota.limit,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'service' });
      } catch (e) {
        // Silently ignore persistence errors in fallback
      }

      return [quota];
    }

    const dbFallback = await fetchLastKnownQuotaFromDb(TIKTOK_SERVICE_NAME);
    return [dbFallback || {
      service: TIKTOK_SERVICE_NAME,
      used: 0,
      limit: 0,
      reset_at: null,
      debug_msg: `${prefix ? prefix + '_' : ''}HDR_MISSING_HEADERS`
    }];
  } catch (error) {
    const isTimeout = error instanceof Error && error.name === 'AbortError';
    console.error(`[RapidAPI Quota] Header fallback failed (${isTimeout ? 'Timeout' : 'Error'}):`, error);
    const dbFallback = await fetchLastKnownQuotaFromDb(TIKTOK_SERVICE_NAME);
    return [dbFallback || {
      service: TIKTOK_SERVICE_NAME,
      used: 0,
      limit: 0,
      reset_at: null,
      debug_msg: `${prefix ? prefix + '_' : ''}H_${isTimeout ? 'TO' : 'CAT'}`
    }];
  }
}

/**
 * Fetches quotas from RapidAPI Platform API (GraphQL)
 * and upserts them into the service_quotas table.
 */
export async function fetchRapidApiQuotas(): Promise<RapidApiQuota[]> {
  const apiKey = process.env.RAPIDAPI_KEY;
  const TIKTOK_SERVICE_NAME = 'TikTok Fetcher';

  if (!apiKey) {
    console.error('[RapidAPI Quota] RAPIDAPI_KEY not found in process.env');
    const fallback = await fetchLastKnownQuotaFromDb(TIKTOK_SERVICE_NAME);
    return [fallback || {
      service: TIKTOK_SERVICE_NAME,
      used: 0,
      limit: 0,
      reset_at: null,
      debug_msg: 'ERR_NO_KEY'
    }];
  }

  const query = `
    query getSubscriptionUsage {
      me {
        subscriptions {
          nodes {
            api { 
              name 
            }
            quotaUsage {
              used
              limit
              resetAt
            }
          }
        }
      }
    }
  `;

  try {
    const res = await fetch(RAPIDAPI_PLATFORM_GQL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-rapidapi-key': apiKey,
        'x-rapidapi-host': 'platform-api.p.rapidapi.com',
      },
      body: JSON.stringify({ query }),
      cache: 'no-store',
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      if (res.status === 429) {
        console.warn('[RapidAPI Quota] Platform API rate limited (429), attempting header fallback...');
        return await fetchQuotaFromHeaders('ERR_429');
      }

      if (res.status === 403 || res.status === 401) {
        console.warn(`[RapidAPI Quota] Platform API unauthorized (${res.status}), attempting header fallback...`);
        return await fetchQuotaFromHeaders('ERR_403');
      }
      
      console.error(`[RapidAPI Quota] Platform API returned ${res.status}`);
      const dbFallback = await fetchLastKnownQuotaFromDb(TIKTOK_SERVICE_NAME);
      return [dbFallback || {
        service: TIKTOK_SERVICE_NAME,
        used: 0,
        limit: 0,
        reset_at: null,
        debug_msg: `ERR_HTTP_${res.status}`
      }];
    }

    const json = await res.json();
    const nodes = json?.data?.me?.subscriptions?.nodes || [];

    if (nodes.length === 0) {
      console.warn('[RapidAPI Quota] No subscription nodes found, attempting header fallback...');
      return await fetchQuotaFromHeaders('ERR_EMPTY_NODES');
    }

    const supabase = createSupabaseAdmin();
    const results: RapidApiQuota[] = [];

    for (const node of nodes) {
      const apiName = node.api?.name;
      const usage = node.quotaUsage;

      if (!apiName || !usage) continue;

      // We are specifically looking for TikTok Scraper
      const isTikTok = apiName.toLowerCase().includes('tiktok') && apiName.toLowerCase().includes('scraper');
      
      if (isTikTok) {
        const quota: RapidApiQuota = {
          service: TIKTOK_SERVICE_NAME, 
          used: Number(usage.used),
          limit: Number(usage.limit),
          reset_at: usage.resetAt || null,
          debug_msg: 'GQL_OK'
        };

        try {
          await ((supabase.from('service_quotas' as never)) as any).upsert({
            service: quota.service,
            used: quota.used,
            limit: quota.limit,
            reset_at: quota.reset_at,
            updated_at: new Date().toISOString(),
          }, { onConflict: 'service' });
        } catch (e) {
          // Ignore upsert errors
        }
        
        results.push(quota);
      }
    }

    if (results.length === 0) {
       return await fetchQuotaFromHeaders('ERR_NO_TIKTOK_NODE');
    }

    return results;
  } catch (error) {
    console.error('[RapidAPI Quota] Error fetching quotas:', error);
    const dbFallback = await fetchLastKnownQuotaFromDb(TIKTOK_SERVICE_NAME);
    return [dbFallback || {
      service: TIKTOK_SERVICE_NAME,
      used: 0,
      limit: 0,
      reset_at: null,
      debug_msg: 'ERR_CATCH'
    }];
  }
}

/**
 * Cached version of fetchRapidApiQuotas
 */
export const getRapidApiQuotasCached = (revalidate = 300) => unstable_cache(
  async () => fetchRapidApiQuotas(),
  ['admin-rapidapi-quotas'],
  { revalidate, tags: ['admin:quotas'] }
)();
