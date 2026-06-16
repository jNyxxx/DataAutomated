import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  const { email, password } = (await request.json()) as { email: string; password: string };

  const configured = process.env.API_URL_INTERNAL;
  if (!configured && process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Server misconfiguration: API_URL_INTERNAL not set' }, { status: 503 });
  }
  const backendUrl = configured ?? 'http://localhost:8000';
  const body = new URLSearchParams({ username: email, password });

  const res = await fetch(`${backendUrl}/auth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  }).catch(() => null);

  if (!res || !res.ok) {
    const err = res ? ((await res.json().catch(() => ({}))) as { detail?: string }) : {};
    return NextResponse.json(
      { error: err.detail ?? 'Invalid credentials' },
      { status: res?.status ?? 503 },
    );
  }

  const { access_token } = (await res.json()) as { access_token: string };

  const response = NextResponse.json({ ok: true });
  response.cookies.set('access_token', access_token, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 14400,
    secure: process.env.NODE_ENV === 'production',
  });

  return response;
}
