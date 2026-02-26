import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// Mobile user agent patterns
const MOBILE_REGEX = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile|mobile|CriOS/i

export function middleware(request: NextRequest) {
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

  // Skip if already on /m/ routes, API routes, auth callback, or static files
  if (
    pathname.startsWith('/m') ||
    pathname.startsWith('/api') ||
    pathname.startsWith('/_next') ||
    pathname.startsWith('/auth/callback') ||
    pathname.includes('.')
  ) {
    return NextResponse.next()
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
