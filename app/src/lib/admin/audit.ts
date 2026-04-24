import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import { recordAuditLog } from '@/lib/admin/audit-log';

export async function recordAdminAction(
  supabase: SupabaseClient,
  args: {
    actorId: string;
    actorEmail: string | null;
    actorRole: string | null;
    action: string;
    entityType: string;
    entityId: string | null;
    metadata?: Record<string, unknown>;
    beforeState?: Record<string, unknown> | null;
    afterState?: Record<string, unknown> | null;
  },
) {
  return recordAuditLog(supabase, {
    actorUserId: args.actorId,
    actorEmail: args.actorEmail,
    actorRole: args.actorRole,
    action: args.action,
    entityType: args.entityType,
    entityId: args.entityId,
    metadata: args.metadata ?? null,
    beforeState: args.beforeState ?? null,
    afterState: args.afterState ?? null,
  });
}
