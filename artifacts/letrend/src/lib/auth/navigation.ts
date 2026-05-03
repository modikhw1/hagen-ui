import { resolveLegacyProfileRole, type AppRole } from '@/lib/auth/roles';

type RoleProfile = {
  role?: string | null;
  is_admin?: boolean | null;
} | null | undefined;

type RouteSurface = 'desktop' | 'mobile';

const ROLE_ROUTE_PREFIXES: Record<AppRole, string[]> = {
  admin: ['/admin', '/studio'],
  content_manager: ['/studio'],
  customer: [
    '/feed',
    '/concept',
    '/billing',
    '/invoice',
    '/welcome',
    '/onboarding',
    '/agreement',
    '/checkout',
    '/m/feed',
    '/m/concept',
  ],
  user: ['/welcome', '/onboarding', '/agreement', '/checkout'],
};

export function resolveAppRole(profile: RoleProfile): AppRole {
  return resolveLegacyProfileRole(profile);
}

export function getPrimaryRouteForRole(
  roleOrProfile: AppRole | RoleProfile,
  options?: {
    surface?: RouteSurface;
    fallback?: string;
  }
): string {
  const role = typeof roleOrProfile === 'string' ? roleOrProfile : resolveAppRole(roleOrProfile);
  const surface = options?.surface ?? 'desktop';

  switch (role) {
    case 'admin':
      return '/admin';
    case 'content_manager':
      return '/studio/customers';
    case 'customer':
      return surface === 'mobile' ? '/m/feed' : '/feed';
    default:
      return options?.fallback ?? '/feed';
  }
}

export function normalizeRedirectCandidate(path: string): string {
  if (path === '/studio-v2' || path.startsWith('/studio-v2/')) {
    return `/studio${path.slice('/studio-v2'.length)}`;
  }

  return path;
}

export function isRoleAuthorizedRedirect(
  path: string,
  roleOrProfile: AppRole | RoleProfile
): boolean {
  const role = typeof roleOrProfile === 'string' ? roleOrProfile : resolveAppRole(roleOrProfile);
  const normalized = normalizeRedirectCandidate(path);
  const [pathname] = normalized.split('?');

  if (!pathname) return false;

  return ROLE_ROUTE_PREFIXES[role].some((prefix) => (
    pathname === prefix || pathname.startsWith(`${prefix}/`)
  ));
}

export function getRoleAuthorizedRedirect(
  candidate: string | null,
  roleOrProfile: AppRole | RoleProfile
): string | null {
  if (!candidate) return null;
  if (!candidate.startsWith('/') || candidate.startsWith('//')) return null;
  if (candidate === '/' || candidate === '/login' || candidate === '/m/login') return null;

  const normalized = normalizeRedirectCandidate(candidate);
  if (!isRoleAuthorizedRedirect(normalized, roleOrProfile)) {
    return null;
  }

  return normalized;
}
