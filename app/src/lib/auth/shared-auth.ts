import 'server-only';

import { cache } from 'react';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { createSupabaseAdmin } from '@/lib/server/supabase-admin';
import { isMissingRelationError } from '@/lib/admin/schema-guards';
import type { AdminScope } from '@/lib/admin/admin-roles';
import type { AuthenticatedUser, UserRole } from './api-auth';
import { AuthError } from './auth-error';

/**
 * Shared authentication logic memoized for a single request.
 * This ensures we only fetch the user profile and roles once per page load/API call.
 */
export const getAuthenticatedUser = cache(async (): Promise<AuthenticatedUser> => {
  const cookieStore = await cookies();
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new AuthError(500, 'Servermiljön är inte korrekt konfigurerad');
  }

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: () => {},
    },
  });

  const { data: { user: authUser }, error: userError } = await supabase.auth.getUser();

  if (userError || !authUser) {
    throw new AuthError(401, 'Du måste logga in');
  }

  const admin = createSupabaseAdmin();
  const [
    { data: profile, error: profileError },
    { data: roles, error: roleError },
    adminRolesResult,
  ] = await Promise.all([
    admin
      .from('profiles')
      .select('email, is_admin, role, matching_data')
      .eq('id', authUser.id)
      .maybeSingle(),
    admin
      .from('user_roles')
      .select('role')
      .eq('user_id', authUser.id),
    admin
      .from('admin_user_roles')
      .select('role')
      .eq('user_id', authUser.id),
  ]);

  if (profileError) {
    console.error('[AUTH] Profile fetch failed:', profileError);
    throw new AuthError(500, `Profile: ${profileError.message}`);
  }
  if (roleError) {
    console.error('[AUTH] User roles fetch failed:', roleError);
    throw new AuthError(500, `UserRoles: ${roleError.message}`);
  }

  if (adminRolesResult.error && !isMissingRelationError(adminRolesResult.error.message)) {
    console.error('[AUTH] Admin roles fetch failed:', adminRolesResult.error);
    throw new AuthError(500, `AdminRoles: ${adminRolesResult.error.message}`);
  }

  let role: UserRole = 'user';
  let isAdmin = false;

  if (roles?.some((entry) => entry.role === 'admin')) {
    role = 'admin';
    isAdmin = true;
  } else if (roles?.some((entry) => entry.role === 'content_manager')) {
    role = 'content_manager';
  } else if (roles?.some((entry) => entry.role === 'customer')) {
    role = 'customer';
  } else {
    role = (profile?.role as UserRole | null) ?? 'user';
    isAdmin = Boolean(profile?.is_admin);
  }

  let adminRoles: AdminScope[] = [];
  if (adminRolesResult.data) {
    adminRoles = adminRolesResult.data.map((row) => row.role as AdminScope);
  }

  return {
    id: authUser.id,
    email: authUser.email ?? profile?.email ?? null,
    role,
    is_admin: isAdmin,
    admin_roles: adminRoles,
    matching_data: (profile?.matching_data as Record<string, unknown> | null) ?? null,
  };
});
