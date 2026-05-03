import type { SupabaseClient } from '@supabase/supabase-js';
import { logger } from '../logger.js';

export type SeenSurface = 'overview' | 'notifications';

export async function getLastSeenAt(
  supabase: SupabaseClient,
  adminId: string,
  surface: SeenSurface,
): Promise<string | null> {
  try {
    const { data } = await (supabase as any)
      .from('admin_notification_seen')
      .select('last_seen_at')
      .eq('admin_id', adminId)
      .eq('surface', surface)
      .maybeSingle();
    return (data?.last_seen_at as string | null) ?? null;
  } catch (err) {
    logger.warn({ err, adminId, surface }, 'last_seen lookup failed');
    return null;
  }
}

export async function markSeen(
  supabase: SupabaseClient,
  adminId: string,
  surface: SeenSurface,
): Promise<string> {
  const nowIso = new Date().toISOString();
  try {
    await (supabase as any)
      .from('admin_notification_seen')
      .upsert(
        { admin_id: adminId, surface, last_seen_at: nowIso },
        { onConflict: 'admin_id,surface' },
      );
  } catch (err) {
    logger.warn({ err, adminId, surface }, 'last_seen upsert failed');
  }
  return nowIso;
}
