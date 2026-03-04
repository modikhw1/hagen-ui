import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'

// Mobile user agent patterns
const MOBILE_REGEX = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile|mobile|CriOS/i

// Protected route patterns
const ADMIN_ROUTES = /^\/admin/
const STUDIO_ROUTES = /^\/studio/
const ADMIN_API = /^\/api\/admin/
const STUDIO_API = /^\/api\/studio/

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  const userAgent = request.headers.get('user-agent') || ''
  const isMobile = MOBILE_REGEX.test(userAgent)

  // Redirect legacy/missing routes to correct destinations
  const legacyRedirects: Record<string, string> = {
    '/register': '/login',
    '/signup': '/login',
    '/auth': '/login',
    '/app': '/',
  }

  if (legacyRedirects[pathname]) {
    const url = request.nextUrl.clone()
    url.pathname = legacyRedirects[pathname].split('?')[0]
    if (legacyRedirects[pathname].includes('?')) {
      const params = new URLSearchParams(legacyRedirects[pathname].split('?')[1])
      params.forEach((value, key) => url.searchParams.set(key, value))
    }
    return NextResponse.redirect(url)
  }

  // Skip auth check for public routes, but process API auth separately
  const skipAuthCheck =
    pathname.startsWith('/m') ||
    pathname.startsWith('/_next') ||
    pathname.startsWith('/auth/callback') ||
    pathname.startsWith('/api/stripe/webhook') ||
    pathname.startsWith('/api/auth') ||
    pathname === '/login' ||
    pathname.includes('.')

  if (skipAuthCheck && !pathname.startsWith('/api/admin') && !pathname.startsWith('/api/studio')) {
    return NextResponse.next()
  }

  // Authentication & Authorization for protected routes
  const isProtectedRoute = ADMIN_ROUTES.test(pathname) ||
                          STUDIO_ROUTES.test(pathname) ||
                          ADMIN_API.test(pathname) ||
                          STUDIO_API.test(pathname)

  if (isProtectedRoute) {
    console.log('[Middleware] Protected route:', pathname);
    console.log('[Middleware] Cookies:', request.cookies.getAll().map(c => c.name));

    // Create response that we can modify
    let response = NextResponse.next({
      request: {
        headers: request.headers,
      },
    })

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll()
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) => {
              response.cookies.set(name, value, options)
            })
          },
        },
      }
    )

    // Check authentication
    const { data: { session }, error: sessionError } = await supabase.auth.getSession()

    console.log('[Middleware] Session check:', {
      hasSession: !!session,
      userId: session?.user?.id,
      email: session?.user?.email,
      error: sessionError?.message,
      accessToken: session?.access_token ? 'present' : 'missing',
      refreshToken: session?.refresh_token ? 'present' : 'missing'
    });

    if (!session) {
      console.log('[Middleware] No session, redirecting to login');
      console.log('[Middleware] Available cookies:', request.cookies.getAll().map(c => ({ name: c.name, value: c.value.substring(0, 20) + '...' })));
      // Redirect to login with return URL
      const url = request.nextUrl.clone()
      url.pathname = '/login'
      url.searchParams.set('redirect', pathname)
      return NextResponse.redirect(url)
    }

    // Fetch user profile with role
    // Note: role column may not exist if migration hasn't been run yet
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, email, is_admin, role')
      .eq('id', session.user.id)
      .single()

    console.log('[Middleware] Profile fetch:', {
      hasProfile: !!profile,
      email: profile?.email,
      isAdmin: profile?.is_admin,
      role: profile?.role,
      error: profileError?.message
    });

    if (!profile) {
      console.log('[Middleware] No profile found, redirecting to login');
      // Profile not found - redirect to login
      const url = request.nextUrl.clone()
      url.pathname = '/login'
      return NextResponse.redirect(url)
    }

    // Determine user role (fallback to is_admin for backwards compatibility)
    const userRole = profile.role || (profile.is_admin ? 'admin' : 'user')

    console.log('[Middleware] Determined role:', userRole);

    // Admin routes: require admin role
    if (ADMIN_ROUTES.test(pathname) || ADMIN_API.test(pathname)) {
      console.log('[Middleware] Admin route check:', {
        isAdmin: profile.is_admin,
        role: userRole,
        hasAccess: profile.is_admin || userRole === 'admin'
      });

      if (!profile.is_admin && userRole !== 'admin') {
        console.log('[Middleware] Access denied, redirecting home');
        const url = request.nextUrl.clone()
        url.pathname = '/'
        url.searchParams.set('error', 'admin_required')
        return NextResponse.redirect(url)
      }
    }

    // Studio routes: require admin or content_manager role
    if (STUDIO_ROUTES.test(pathname) || STUDIO_API.test(pathname)) {
      const allowedRoles = ['admin', 'content_manager']
      if (!profile.is_admin && !allowedRoles.includes(userRole)) {
        const url = request.nextUrl.clone()
        url.pathname = '/'
        url.searchParams.set('error', 'access_denied')
        return NextResponse.redirect(url)
      }
    }

    // Add user context to headers for API routes
    const requestHeaders = new Headers(request.headers)
    requestHeaders.set('x-user-id', session.user.id)
    requestHeaders.set('x-user-email', session.user.email || '')
    requestHeaders.set('x-user-role', userRole)

    return NextResponse.next({
      request: {
        headers: requestHeaders,
      },
    })
  }

  // Redirect mobile users to /m/ equivalent
  if (isMobile) {
    const url = request.nextUrl.clone()

    // Map routes: / -> /m, /login -> /m/login, /concept/[id] -> /m/concept/[id]
    if (pathname === '/') {
      url.pathname = '/m'
    } else if (pathname === '/login') {
      url.pathname = '/m/login'
    } else if (pathname.startsWith('/concept/')) {
      url.pathname = `/m${pathname}`
    } else {
      // Default: prepend /m to the path
      url.pathname = `/m${pathname}`
    }

    return NextResponse.redirect(url)
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    // Match all paths except static files and api
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
}
