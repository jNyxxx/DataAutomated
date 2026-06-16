import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Belt-and-suspenders: the DashboardLayout Server Component also calls
// getTokenServerSide() and redirects — middleware catches it first, before
// any RSC rendering work happens.
export function middleware(request: NextRequest) {
  const token = request.cookies.get('access_token')?.value;

  if (!token) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  // Fail closed: treat any token that can't be decoded as expired.
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    if (typeof payload.exp !== 'number' || payload.exp * 1000 < Date.now()) {
      const response = NextResponse.redirect(new URL('/login', request.url));
      response.cookies.delete('access_token');
      return response;
    }
  } catch {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  return NextResponse.next();
}

export const config = {
  // Protect all dashboard routes. The (dashboard) route group maps to these
  // top-level segments. /api/auth/* and /login are intentionally excluded.
  matcher: [
    '/dashboard/:path*',
    '/insights/:path*',
    '/signals/:path*',
    '/journeys/:path*',
    '/reports/:path*',
    '/settings/:path*',
    '/onboarding/:path*',
    '/onboarding',
  ],
};
