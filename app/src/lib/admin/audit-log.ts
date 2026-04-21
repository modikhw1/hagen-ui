import type { SupabaseClient } from '@supabase/supabase-js';
import { isMissingRelationError } from '@/lib/admin/schema-guards';

export type AuditLogInput = {
  actorUserId: string | null;
  actorEmail?: string | null;
  actorRole?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  beforeState?: Record<string, unknown> | null;
  afterState?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
};

export type AuditLogEntry = {
  id: string;
  actor_user_id: string | null;
  actor_email: string | null;
  actor_role: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  before_state: Record<string, unknown> | null;
  after_state: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

export async function recordAuditLog(
  supabaseAdmin: SupabaseClient,
  input: AuditLogInput,
) {
  const { error } = await (((supabaseAdmin.from('audit_log' as never) as never) as {
    insert: (value: Record<string, unknown>) => Promise<{ error: { message?: string } | null }>;
  }).insert({
    actor_user_id: input.actorUserId,
    actor_email: input.actorEmail ?? null,
    actor_role: input.actorRole ?? null,
    action: input.action,
    entity_type: input.entityType,
    entity_id: input.entityId ?? null,
    before_state: input.beforeState ?? null,
    after_state: input.afterState ?? null,
    metadata: input.metadata ?? null,
  }));

  if (error) {
    if (isMissingRelationError(error.message)) return false;
    console.error('[audit-log] failed to insert row', error.message);
    return false;
  }

  return true;
}

export async function listAuditLog(
  supabaseAdmin: SupabaseClient,
  limit = 100,
): Promise<{ entries: AuditLogEntry[]; schemaWarnings: string[] }> {
  const result = await (((supabaseAdmin.from('audit_log' as never) as never) as {
    select: (columns: string) => {
      order: (column: string, options: { ascending: boolean }) => {
        limit: (value: number) => Promise<{
          data: AuditLogEntry[] | null;
          error: { message?: string } | null;
        }>;
      };
    };
  }).select(
    'id, actor_user_id, actor_email, actor_role, action, entity_type, entity_id, before_state, after_state, metadata, created_at',
  )).order('created_at', { ascending: false }).limit(limit);

  if (result.error) {
    if (isMissingRelationError(result.error.message)) {
      return {
        entries: [],
        schemaWarnings: ['Audit-logg-tabellen saknas i databasen. Kor migrationen for §2.'],
      };
    }

    throw new Error(result.error.message || 'Kunde inte hamta audit-logg');
  }

  return {
    entries: result.data ?? [],
    schemaWarnings: [],
  };
}
