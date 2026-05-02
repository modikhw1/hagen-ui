import type { SupabaseClient } from '@supabase/supabase-js';
import { isMissingRelationError } from '@/lib/admin/schema-guards';

export async function getLatestAdminAttentionSeenAt(
  supabaseAdmin: SupabaseClient,
  userId: string,
) {
  const result = await (((supabaseAdmin.from('events' as never) as never) as {
    select: (columns: string) => {
      eq: (column: string, value: string) => {
        eq: (column: string, value: string) => {
          eq: (column: string, value: string) => {
            order: (
              column: string,
              options: { ascending: boolean },
            ) => {
              limit: (value: number) => Promise<{
                data: Array<{ created_at: string | null }> | null;
                error: { message?: string } | null;
              }>;
            };
          };
        };
      };
    };
  }).select('created_at'))
    .eq('type', 'admin.attention_seen')
    .eq('entity_type', 'admin_user')
    .eq('entity_id', userId)
    .order('created_at', { ascending: false })
    .limit(1);

  if (result.error) {
    if (isMissingRelationError(result.error.message)) {
      return null;
    }

    throw new Error(result.error.message || 'Kunde inte lasa senaste attention-markering');
  }

  return result.data?.[0]?.created_at ?? null;
}

export async function recordAdminAttentionSeenEvent(
  supabaseAdmin: SupabaseClient,
  input: {
    userId: string;
    surface: 'overview' | 'notifications';
  },
) {
  const result = await (((supabaseAdmin.from('events' as never) as never) as {
    insert: (value: Record<string, unknown>) => Promise<{
      error: { message?: string } | null;
    }>;
  }).insert({
    type: 'admin.attention_seen',
    severity: 'info',
    entity_type: 'admin_user',
    entity_id: input.userId,
    payload: {
      surface: input.surface,
    },
  }));

  if (result.error) {
    if (isMissingRelationError(result.error.message)) {
      return;
    }

    throw new Error(result.error.message || 'Kunde inte spara attention-markering');
  }
}
