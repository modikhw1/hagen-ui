import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';

export type InteractionType =
  | 'login'
  | 'feedplan_edit'
  | 'concept_added'
  | 'email_sent'
  | 'note_added'
  | 'tiktok_upload_synced'
  | 'customer_updated';

type JsonValue =
  | string
  | number
  | boolean
  | null
  | { [key: string]: JsonValue | undefined }
  | JsonValue[];
type JsonObject = Record<string, JsonValue | undefined>;
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

    // Resolve cm_email (required by cm_activities)
    const { data: profile } = input.cmProfileId 
      ? await supabase.from('profiles').select('email').eq('id', input.cmProfileId).single()
      : { data: null };
    
    const cmEmail = profile?.email || 'unknown';

    // ALSO log to cm_activities for the new operational pulse logic
    // We try to map InteractionType to ActivityType where possible
    const activityMap: Record<InteractionType, string> = {
      'concept_added': 'concept_added',
      'note_added': 'customer_updated',
      'feedplan_edit': 'concept_reordered',
      'tiktok_upload_synced': 'customer_updated',
      'customer_updated': 'customer_updated',
      'login': 'customer_updated',
      'email_sent': 'customer_updated'
    };

    const activityType = activityMap[input.type] || 'customer_updated';

    await (supabase.from('cm_activities') as any).insert({
      cm_id: cmId,
      cm_user_id: input.cmProfileId || null,
      cm_email: cmEmail,
      customer_profile_id: input.customerId ?? null,
      activity_type: activityType,
      description: `Interaction: ${input.type}`,
      metadata: (input.metadata ?? {}) as JsonObject,
    });
  } catch (error) {
    console.error('[interactions] Unexpected logging error:', error);
  }
}
