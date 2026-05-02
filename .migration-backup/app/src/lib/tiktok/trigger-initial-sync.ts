import 'server-only';

import { fetchFullProfileHistory } from '@/lib/studio/fetch-full-profile-history';
import { createSupabaseAdmin } from '@/lib/server/supabase-admin';

type SupabaseAdmin = ReturnType<typeof createSupabaseAdmin>;

export async function triggerInitialTikTokSync(params: {
  supabaseAdmin: SupabaseAdmin;
  customerId: string;
  tiktokHandle: string | null | undefined;
  lastHistorySyncAt: string | null | undefined;
  source: 'invite' | 'profile_link';
}) {
  if (params.lastHistorySyncAt) {
    return;
  }

  const handle =
    typeof params.tiktokHandle === 'string'
      ? params.tiktokHandle.trim().replace(/^@/, '')
      : '';
  if (!handle) {
    return;
  }

  const rapidApiKey = process.env.RAPIDAPI_KEY;
  if (!rapidApiKey) {
    return;
  }

  try {
    const result = await fetchFullProfileHistory({
      supabase: params.supabaseAdmin,
      customerId: params.customerId,
      handle,
      rapidApiKey,
    });

    if (result.error === 'already_locked') {
      return;
    }
  } catch (error) {
    console.error('[tiktok.initial-sync] failed', {
      customerId: params.customerId,
      source: params.source,
      message: error instanceof Error ? error.message : String(error),
    });
  }
}
