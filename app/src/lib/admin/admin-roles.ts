import type { SupabaseClient } from '@supabase/supabase-js';
import {
  isMissingEnumError,
  isMissingRelationError,
} from '@/lib/admin/schema-guards';

export type AdminRole = 'super_admin' | 'operations_admin';

export async function getAdminRoles(
  supabaseAdmin: SupabaseClient,
  userId: string,
): Promise<AdminRole[]> {
  const result = await (((supabaseAdmin.from('admin_user_roles' as never) as never) as {
    select: (columns: string) => {
      eq: (column: string, value: string) => Promise<{
        data: Array<{ role: AdminRole }> | null;
        error: { message?: string } | null;
      }>;
    };
  }).select('role')).eq('user_id', userId);

  if (result.error) {
    if (isMissingRelationError(result.error.message)) return [];
    throw new Error(result.error.message || 'Kunde inte hamta adminroller');
  }

  return (result.data ?? []).map((row) => row.role);
}

export async function syncAdminAccessRole(params: {
  supabaseAdmin: SupabaseClient;
  userId: string;
  shouldHaveAdminAccess: boolean;
  role?: AdminRole;
}) {
  const { supabaseAdmin, userId, shouldHaveAdminAccess, role = 'operations_admin' } = params;

  if (shouldHaveAdminAccess) {
    const result = await (((supabaseAdmin.from('admin_user_roles' as never) as never) as {
      upsert: (
        value: Record<string, unknown>,
        options: { onConflict: string },
      ) => Promise<{ error: { message?: string } | null }>;
    }).upsert({ user_id: userId, role }, { onConflict: 'user_id,role' }));

    if (result.error) {
      if (isMissingRelationError(result.error.message) || isMissingEnumError(result.error.message)) {
        return false;
      }
      throw new Error(result.error.message || 'Kunde inte spara adminroll');
    }

    return true;
  }

  const result = await (((supabaseAdmin.from('admin_user_roles' as never) as never) as {
    delete: () => {
      eq: (column: string, value: string) => {
        eq: (innerColumn: string, innerValue: string) => Promise<{ error: { message?: string } | null }>;
      };
    };
  }).delete()).eq('user_id', userId).eq('role', role);

  if (result.error) {
    if (isMissingRelationError(result.error.message) || isMissingEnumError(result.error.message)) {
      return false;
    }
    throw new Error(result.error.message || 'Kunde inte rensa adminroll');
  }

  return true;
}
