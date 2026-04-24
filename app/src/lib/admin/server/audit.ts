import 'server-only';

import { auditLogFilterSchema, type AuditLogFilter } from '@/lib/admin/schemas/audit';
import { listAuditLog } from '@/lib/admin/audit-log';
import { createSupabaseAdmin } from '@/lib/server/supabase-admin';

export async function fetchAuditLogServer(filter: Partial<AuditLogFilter>) {
  const parsed = auditLogFilterSchema.parse({
    ...filter,
    limit: filter.limit ?? 50,
  });
  
  const result = await listAuditLog(createSupabaseAdmin(), parsed);
  const nextCursor =
    result.entries.length === parsed.limit
      ? `${result.entries[result.entries.length - 1]?.created_at}|${result.entries[result.entries.length - 1]?.id}`
      : null;
  const facets = {
    actors: Array.from(
      new Set(result.entries.map((entry) => entry.actor_email).filter(Boolean)),
    ) as string[],
    actions: Array.from(new Set(result.entries.map((entry) => entry.action))),
    entities: Array.from(new Set(result.entries.map((entry) => entry.entity_type))),
  };
  
  return {
    entries: result.entries,
    nextCursor,
    viewer: {
      email: null, // Client handles viewer, but server fetch returns null or omit
    },
    facets,
    schemaWarnings: result.schemaWarnings,
  };
}
