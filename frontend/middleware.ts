import { NextRequest, NextResponse } from 'next/server';

const PUBLIC_PATHS = ['/login'];

/**
 * Decode the JWT payload and return the `exp` claim (Unix seconds).
 * No signature verification — the backend does that on every API call.
 * We only check expiry here so an expired token triggers a clean redirect
 * to /login instead of an empty dashboard full of silent 401s.
 * Works in Edge runtime (uses only atob, available globally).
 */
function jwtExpiry(jwt: string): number | null {
  try {
    const part = jwt.split('.')[1];
    if (!part) return null;
    const payload = JSON.parse(atob(part.replace(/-/g, '+').replace(/_/g, '/'))) as { exp?: number };
    return typeof payload.exp === 'number' ? payload.exp : null;
  } catch {
    return null;
  }
}

function isTokenExpired(jwt: string): boolean {
  const exp = jwtExpiry(jwt);
  if (exp === null) return true; // malformed → treat as expired
  return Date.now() / 1000 >= exp;
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // API route handlers manage their own auth (they read the HttpOnly cookie
  // server-side and forward it to the backend). Never apply the token-redirect
  // guard to /api/* paths — doing so would block the login route handler itself.
  if (pathname.startsWith('/api/')) {
    return NextResponse.next();
  }

  const token = request.cookies.get('token')?.value;

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-pathname', pathname);

  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    if (token && !isTokenExpired(token) && pathname === '/login') {
      return NextResponse.redirect(new URL('/dashboard', request.url));
    }
    return NextResponse.next({
      request: {
        headers: requestHeaders,
      }
    });
  }

  // No token or expired token → clear the stale cookie and redirect to login.
  if (!token || isTokenExpired(token)) {
    const response = NextResponse.redirect(new URL('/login', request.url));
    if (token) {
      // Expired but still present: clear it so the login page starts fresh.
      response.cookies.set('token', '', { maxAge: 0, path: '/' });
    }
    return response;
  }

  if (pathname === '/') {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  return NextResponse.next({
    request: {
      headers: requestHeaders,
    }
  });
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)'],
};
