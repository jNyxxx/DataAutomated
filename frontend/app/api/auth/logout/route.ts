import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

export async function POST() {
  // SR-01: revoke the token server-side (shared denylist) before clearing the cookie,
  // so it cannot be replayed on another backend instance. Best-effort — the cookie is
  // always cleared even if the revocation call fails.
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get('access_token')?.value;
    if (token) {
      const base =
        process.env.API_URL_INTERNAL ??
        process.env.NEXT_PUBLIC_API_URL ??
        'http://localhost:8000';
      await fetch(`${base}/auth/logout`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      });
    }
  } catch {
    // ignore — fall through to clearing the cookie regardless
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.delete('access_token');
  return response;
}
