import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';

export type InteractionType =
  | 'login'
  | 'feedplan_edit'
  | 'concept_added'
  | 'email_sent'
  | 'note_added'
  | 'tiktok_upload_synced';

type JsonObject = Record<string, unknown>;
type DatabaseClient = SupabaseClient<Database>;

const teamMemberCache = new Map<string, string | null>();

async function getDefaultClient(): Promise<DatabaseClient> {
  if (typeof window !== 'undefined') {
    const { supabase } = await import('@/lib/supabase/client');
    return supabase as DatabaseClient;
  }

  const { createSupabaseAdmin } = await import('@/lib/server/supabase-admin');
  return createSupabaseAdmin();
}

export async function resolveTeamMemberIdForProfile(
  profileId: string | null | undefined,
  client?: DatabaseClient,
): Promise<string | null> {
  if (!profileId) return null;

  if (teamMemberCache.has(profileId)) {
    return teamMemberCache.get(profileId) ?? null;
  }

  const supabase = client ?? await getDefaultClient();
  const { data, error } = await supabase
    .from('team_members')
    .select('id')
    .eq('profile_id', profileId)
    .eq('is_active', true)
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error('[interactions] Failed to resolve team member:', error);
    return null;
  }

  const teamMemberId = data?.id ?? null;
  teamMemberCache.set(profileId, teamMemberId);
  return teamMemberId;
}

export async function logInteraction(input: {
  type: InteractionType;
  cmId?: string | null;
  cmProfileId?: string | null;
  customerId?: string | null;
  metadata?: JsonObject;
  client?: DatabaseClient;
}): Promise<void> {
  try {
    const supabase = input.client ?? await getDefaultClient();
    const cmId = input.cmId ?? await resolveTeamMemberIdForProfile(input.cmProfileId, supabase);

    if (!cmId) {
      return;
    }

    const { error } = await (supabase.from('cm_interactions' as never) as never as {
      insert: (value: Record<string, unknown>) => Promise<{ error: { message: string } | null }>;
    })
      .insert({
        cm_id: cmId,
        customer_id: input.customerId ?? null,
        type: input.type,
        metadata: input.metadata ?? null,
      });

    if (error) {
      console.error('[interactions] Failed to log interaction:', error);
    }
  } catch (error) {
    console.error('[interactions] Unexpected logging error:', error);
  }
}
