import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { getPrimaryRouteForRole, resolveAppRole } from '@/lib/auth/navigation'

const MOBILE_REGEX = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile|mobile|CriOS/i

const ADMIN_ROUTES = /^\/admin/
const STUDIO_ROUTES = /^\/studio/
const CUSTOMER_ROUTES = /^\/(customer|feed|concept)(\/|$)/
const MOBILE_CUSTOMER_ROUTES = /^\/m\/(feed|customer|concept)(\/|$)/
const ADMIN_API = /^\/api\/admin/
const STUDIO_API = /^\/api\/studio/
const CUSTOMER_API = /^\/api\/customer/

export async function middleware(request: NextRequest) {
  const requestId = request.headers.get('x-request-id') || crypto.randomUUID()
  const requestHeaders = new Headers(request.headers)
  requestHeaders.set('x-request-id', requestId)
  const withRequestId = (response: NextResponse) => {
    response.headers.set('x-request-id', requestId)
    return response
  }

  const { pathname } = request.nextUrl
  const requestedPath = `${request.nextUrl.pathname}${request.nextUrl.search}`
  const userAgent = request.headers.get('user-agent') || ''
  const isMobile = MOBILE_REGEX.test(userAgent)

  const legacyRedirects: Record<string, string> = {
    '/register': '/login',
    '/signup': '/login',
    '/auth': '/login',
    '/app': '/',
    '/customer': '/feed',
    '/customer/feed': '/feed',
    '/m/customer': '/m/feed',
    '/m/customer/feed': '/m/feed',
  }

  if (pathname === '/' && request.nextUrl.searchParams.get('demo') === 'true') {
    const url = request.nextUrl.clone()
    url.pathname = '/m/legacy-demo'
    url.search = ''
    return withRequestId(NextResponse.redirect(url))
  }

  if (pathname === '/m') {
    const isLegacyDemo = request.nextUrl.searchParams.get('demo') === 'true'
    const isLegacyAuthDemo = request.nextUrl.searchParams.get('auth') === 'true'

    if (isLegacyDemo || isLegacyAuthDemo) {
      const url = request.nextUrl.clone()
      url.pathname = '/m/legacy-demo'
      url.search = ''
      if (isLegacyAuthDemo) {
        url.searchParams.set('auth', 'true')
      }
      return withRequestId(NextResponse.redirect(url))
    }
  }

  if (legacyRedirects[pathname]) {
    const url = request.nextUrl.clone()
    const target = legacyRedirects[pathname]
    url.pathname = target.split('?')[0]
    if (target.includes('?')) {
      const params = new URLSearchParams(target.split('?')[1])
      params.forEach((value, key) => url.searchParams.set(key, value))
    }
    return withRequestId(NextResponse.redirect(url))
  }

  if (pathname === '/studio-v2' || pathname.startsWith('/studio-v2/')) {
    const url = request.nextUrl.clone()
    url.pathname = pathname.replace('/studio-v2', '/studio')
    return withRequestId(NextResponse.redirect(url))
  }

  if (pathname.startsWith('/customer/concept/')) {
    const url = request.nextUrl.clone()
    url.pathname = pathname.replace('/customer/concept', '/concept')
    return withRequestId(NextResponse.redirect(url))
  }

  if (pathname.startsWith('/m/customer/concept/')) {
    const url = request.nextUrl.clone()
    url.pathname = pathname.replace('/m/customer/concept', '/m/concept')
    return withRequestId(NextResponse.redirect(url))
  }

  const isAdminApi = ADMIN_API.test(pathname)
  const isStudioApi = STUDIO_API.test(pathname)
  const isCustomerApi = CUSTOMER_API.test(pathname)
  const isApiRoute = isAdminApi || isStudioApi || isCustomerApi
  const isAdminPage = ADMIN_ROUTES.test(pathname)
  const isStudioPage = STUDIO_ROUTES.test(pathname)
  const isCustomerPage = CUSTOMER_ROUTES.test(pathname)
  const isMobileCustomerPage = MOBILE_CUSTOMER_ROUTES.test(pathname)
  const isProtectedRoute = isAdminPage || isStudioPage || isCustomerPage || isMobileCustomerPage || isApiRoute

  // Public mobile routes (exact matches or specific prefixes only)
  const isMobilePublic =
    pathname === '/m' ||
    pathname === '/m/legacy-demo' ||
    pathname === '/m/login' ||
    pathname === '/m/register' ||
    pathname.startsWith('/m/login/') ||
    pathname.startsWith('/m/register/')

  const bypassMiddleware =
    isMobilePublic ||
    pathname.startsWith('/_next') ||
    pathname.startsWith('/auth/callback') ||
    pathname.startsWith('/api/stripe/webhook') ||
    pathname.startsWith('/api/auth') ||
    pathname.includes('.')

  if (!isProtectedRoute && bypassMiddleware) {
    return withRequestId(NextResponse.next({
      request: {
        headers: requestHeaders,
      },
    }))
  }

  if (isProtectedRoute) {
    let response = NextResponse.next({
      request: {
        headers: requestHeaders,
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
            cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
            response = NextResponse.next({
              request: {
                headers: requestHeaders,
              },
            })
            cookiesToSet.forEach(({ name, value, options }) => {
              response.cookies.set(name, value, options)
            })
          },
        },
      }
    )

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      if (isApiRoute) {
        return withRequestId(NextResponse.json({ error: 'Unauthorized - Please log in' }, { status: 401 }))
      }

      const url = request.nextUrl.clone()
      url.search = ''
      if (isMobileCustomerPage) {
        url.pathname = '/m/login'
        url.searchParams.set('redirect', requestedPath)
      } else if (isMobile && isCustomerPage) {
        url.pathname = '/m/login'
        url.searchParams.set('redirect', `/m${requestedPath}`)
      } else {
        url.pathname = '/login'
        url.searchParams.set('redirect', requestedPath)
      }
      return withRequestId(NextResponse.redirect(url))
    }

    if (isApiRoute) {
      return withRequestId(response)
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('id, email, is_admin, role')
      .eq('id', user.id)
      .single()

    if (!profile) {
      const url = request.nextUrl.clone()
      url.search = ''
      url.pathname = '/login'
      url.searchParams.set('redirect', requestedPath)
      url.searchParams.set('error', 'profile_not_ready')
      return withRequestId(NextResponse.redirect(url))
    }

    const userRole = resolveAppRole(profile)

    if (isAdminPage && !profile.is_admin && userRole !== 'admin') {
      const url = request.nextUrl.clone()
      url.search = ''
      if (userRole === 'user') {
        url.pathname = '/'
        url.searchParams.set('error', 'admin_required')
      } else {
        url.pathname = getPrimaryRouteForRole(userRole, {
          surface: isMobile ? 'mobile' : 'desktop',
          fallback: '/feed',
        })
      }
      return withRequestId(NextResponse.redirect(url))
    }

    if (isStudioPage) {
      const allowedRoles = ['admin', 'content_manager']
      if (!profile.is_admin && !allowedRoles.includes(userRole)) {
        const url = request.nextUrl.clone()
        url.search = ''
        if (userRole === 'customer') {
          url.pathname = getPrimaryRouteForRole(userRole, {
            surface: isMobile ? 'mobile' : 'desktop',
            fallback: '/feed',
          })
        } else {
          url.pathname = '/login'
          url.searchParams.set('error', 'access_denied')
        }
        return withRequestId(NextResponse.redirect(url))
      }
    }

    if (isCustomerPage || isMobileCustomerPage) {
      if (userRole !== 'customer') {
        const url = request.nextUrl.clone()
        url.search = ''
        if (userRole === 'user') {
          url.pathname = isMobileCustomerPage ? '/m/login' : '/login'
          url.searchParams.set('error', 'access_denied')
        } else {
          url.pathname = getPrimaryRouteForRole(userRole, {
            surface: isMobile ? 'mobile' : 'desktop',
            fallback: '/feed',
          })
        }
        return withRequestId(NextResponse.redirect(url))
      }

      // Desktop customer visiting /feed or /customer/* → redirect to mobile equivalent
      if (!isMobileCustomerPage && isMobile) {
        const url = request.nextUrl.clone()
        url.pathname = `/m${pathname}`
        return withRequestId(NextResponse.redirect(url))
      }
    }

    return withRequestId(response)
  }

  if (isMobile) {
    const url = request.nextUrl.clone()

    if (pathname === '/') {
      url.pathname = '/m'
    } else if (pathname === '/login') {
      url.pathname = '/m/login'
    } else if (pathname.startsWith('/concept/')) {
      url.pathname = `/m${pathname}`
    } else {
      return withRequestId(NextResponse.next({
        request: {
          headers: requestHeaders,
        },
      }))
    }

    return withRequestId(NextResponse.redirect(url))
  }

  return withRequestId(NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  }))
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
}
