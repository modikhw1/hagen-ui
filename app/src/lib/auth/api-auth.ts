/**
 * API Authentication Helper
 *
 * Provides JWT validation and role-based access control for API routes.
 * Use this to protect all /api/admin/** and /api/studio/** endpoints.
 *
 * Usage:
 * ```typescript
 * import { withAuth } from '@/lib/auth/api-auth'
 *
 * export const GET = withAuth(
 *   async (request, user) => {
 *     // user.id, user.role are validated
 *     return NextResponse.json({ data: 'protected data' })
 *   },
 *   ['admin'] // Required roles
 * )
 * ```
 */

import { NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { jsonError, jsonOk } from '@/lib/server/api-response'
import { createSupabaseAdmin } from '@/lib/server/supabase-admin'

export type UserRole = 'admin' | 'content_manager' | 'customer' | 'user'

export interface AuthenticatedUser {
  id: string
  email: string | null
  role: UserRole
  is_admin: boolean
}

/**
 * Custom error class for authentication failures
 */
export class AuthError extends Error {
  constructor(
    public statusCode: number,
    message: string
  ) {
    super(message)
    this.name = 'AuthError'
  }
}

/**
 * Validates JWT from request and returns authenticated user with role.
 *
 * Validates via JWT from cookies (Supabase session).
 *
 * @param request - Next.js request object
 * @param requiredRoles - Optional array of roles that are allowed
 * @throws AuthError if validation fails or user lacks required role
 * @returns Authenticated user object with id, email, role, is_admin
 */
export async function validateApiRequest(
  _request: NextRequest,
  requiredRoles: UserRole[] = ['admin']
): Promise<AuthenticatedUser> {
  const cookieStore = await cookies()

  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    !process.env.SUPABASE_SERVICE_ROLE_KEY
  ) {
    throw new AuthError(500, 'Servermiljon ar inte korrekt konfigurerad')
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  const supabase = createServerClient(
    supabaseUrl,
    supabaseAnonKey,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: () => {}, // Read-only for API routes
      },
    }
  )

  const { data: { session }, error: sessionError } = await supabase.auth.getSession()

  if (sessionError || !session) {
    throw new AuthError(401, 'Du maste logga in')
  }

  const admin = createSupabaseAdmin()
  const [{ data: profile, error: profileError }, { data: roles, error: roleError }] =
    await Promise.all([
      admin
        .from('profiles')
        .select('email, is_admin, role')
        .eq('id', session.user.id)
        .maybeSingle(),
      admin
        .from('user_roles')
        .select('role')
        .eq('user_id', session.user.id),
    ])

  if (profileError) {
    throw new AuthError(500, profileError.message)
  }

  if (roleError) {
    throw new AuthError(500, roleError.message)
  }

  let role: UserRole = 'user'
  let isAdmin = false

  if (roles?.some((entry) => entry.role === 'admin')) {
    role = 'admin'
    isAdmin = true
  } else if (roles?.some((entry) => entry.role === 'content_manager')) {
    role = 'content_manager'
  } else if (roles?.some((entry) => entry.role === 'customer')) {
    role = 'customer'
  } else {
    role = (profile?.role as UserRole | null) ?? 'user'
    isAdmin = Boolean(profile?.is_admin)
  }

  const authenticatedUser: AuthenticatedUser = {
    id: session.user.id,
    email: session.user.email ?? profile?.email ?? null,
    role,
    is_admin: isAdmin,
  }

  if (
    requiredRoles.length > 0 &&
    !requiredRoles.includes(authenticatedUser.role) &&
    !(requiredRoles.includes('admin') && authenticatedUser.is_admin)
  ) {
    throw new AuthError(403, 'Du saknar behorighet')
  }

  return authenticatedUser
}

/**
 * Higher-order function to wrap API route handlers with authentication.
 *
 * This is the recommended way to protect API routes. It handles:
 * - JWT validation
 * - Role-based access control
 * - Error handling and consistent error responses
 *
 * @param handler - Your API route handler function
 * @param requiredRoles - Array of roles that can access this endpoint (e.g., ['admin', 'content_manager'])
 * @returns Wrapped handler with authentication
 *
 * @example
 * ```typescript
 * // Admin-only endpoint
 * export const GET = withAuth(
 *   async (request, user) => {
 *     const { data } = await supabase.from('customers').select('*')
 *     return NextResponse.json({ data })
 *   },
 *   ['admin']
 * )
 *
 * // Admin and Content Manager endpoint
 * export const POST = withAuth(
 *   async (request, user) => {
 *     const body = await request.json()
 *     // Create concept...
 *     return NextResponse.json({ success: true })
 *   },
 *   ['admin', 'content_manager']
 * )
 * ```
 */
export function withAuth<T, Args extends unknown[] = unknown[]>(
  handler: (request: NextRequest, user: AuthenticatedUser, ...args: Args) => Promise<Response | T>,
  requiredRoles: UserRole[] = ['admin']
) {
  return async (request: NextRequest, ...args: Args): Promise<Response> => {
    try {
      const user = await validateApiRequest(request, requiredRoles)
      const result = await handler(request, user, ...args)

      // If handler returns a Response, return it directly
      if (result instanceof Response) {
        return result
      }

      // Otherwise, wrap in JSON response
      return jsonOk(result as Record<string, unknown>)
    } catch (error) {
      if (error instanceof AuthError) {
        return jsonError(error.message, error.statusCode)
      }

      console.error('API authentication error:', error)
      return jsonError('Autentisering misslyckades', 500)
    }
  }
}

/**
 * Utility function to check if a user has a specific role.
 * Useful for conditional logic within handlers.
 *
 * @param user - Authenticated user object
 * @param roles - Role or array of roles to check
 * @returns true if user has any of the specified roles
 *
 * @example
 * ```typescript
 * if (hasRole(user, ['admin'])) {
 *   // Admin-only logic
 * }
 * ```
 */
export function hasRole(user: AuthenticatedUser, roles: UserRole | UserRole[]): boolean {
  const roleArray = Array.isArray(roles) ? roles : [roles]
  return roleArray.includes(user.role) || user.is_admin
}

/**
 * Utility function to require admin access within a handler.
 * Throws AuthError if user is not admin.
 *
 * @param user - Authenticated user object
 * @throws AuthError with status 403 if user is not admin
 *
 * @example
 * ```typescript
 * export const DELETE = withAuth(async (request, user) => {
 *   requireAdmin(user) // Throws if not admin
 *   // Delete operation...
 * }, ['admin', 'content_manager'])
 * ```
 */
export function requireAdmin(user: AuthenticatedUser): void {
  if (!user.is_admin && user.role !== 'admin') {
    throw new AuthError(403, 'Adminbehorighet kravs')
  }
}

/**
 * Utility function to require content manager or admin access.
 * Throws AuthError if user doesn't have sufficient permissions.
 *
 * @param user - Authenticated user object
 * @throws AuthError with status 403 if user is not CM or admin
 */
export function requireContentManager(user: AuthenticatedUser): void {
  if (!user.is_admin && !['admin', 'content_manager'].includes(user.role)) {
    throw new AuthError(403, 'CM- eller adminbehorighet kravs')
  }
}
