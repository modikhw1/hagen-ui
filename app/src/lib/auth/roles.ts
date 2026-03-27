/**
 * Role Utilities
 *
 * Provides role normalization and resolution utilities for RBAC.
 */

export type AppRole = 'admin' | 'content_manager' | 'customer' | 'user';

const ROLE_PRIORITY: AppRole[] = ['admin', 'content_manager', 'customer', 'user'];

function isAppRole(value: string): value is AppRole {
  return ROLE_PRIORITY.includes(value as AppRole);
}

/**
 * Normalize a list of role entries to AppRole[]
 */
export function normalizeRoleList(values: Array<{ role: string } | string> | null | undefined): AppRole[] {
  const raw = (values || []).map((entry) => (typeof entry === 'string' ? entry : entry.role));
  const deduped = Array.from(new Set(raw.filter((value): value is string => typeof value === 'string')));
  return deduped.filter(isAppRole);
}

/**
 * Resolve the primary (highest priority) role from a list
 */
export function resolvePrimaryRole(values: Array<{ role: string } | string> | null | undefined): AppRole {
  const roles = normalizeRoleList(values);
  for (const role of ROLE_PRIORITY) {
    if (roles.includes(role)) return role;
  }
  return 'user';
}

/**
 * Check if any role in the list is admin
 */
export function isAdminRole(values: Array<{ role: string } | string> | null | undefined): boolean {
  return normalizeRoleList(values).includes('admin');
}

type LegacyRoleInput = {
  role?: string | null;
  is_admin?: boolean | null;
} | null | undefined;

/**
 * Resolve role from legacy profile format (is_admin boolean + role string)
 */
export function resolveLegacyProfileRole(profile: LegacyRoleInput): AppRole {
  if (profile?.is_admin) return 'admin';
  const legacyRole = typeof profile?.role === 'string' ? profile.role : null;
  return isAppRole(legacyRole || '') ? legacyRole as AppRole : 'user';
}
