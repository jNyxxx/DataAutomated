import { NextRequest, NextResponse } from 'next/server';

const BACKEND = process.env.API_URL_INTERNAL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000';
const IS_PROD = process.env.NODE_ENV === 'production';

export async function POST(request: NextRequest) {
  let email: string;
  let password: string;
  try {
    const body = await request.json() as { email?: string; password?: string };
    email = body.email?.trim() ?? '';
    password = body.password ?? '';
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  if (!email || !password) {
    return NextResponse.json({ error: 'Email and password required.' }, { status: 400 });
  }

  const form = new URLSearchParams({ username: email, password });
  let upstream: Response;
  try {
    upstream = await fetch(`${BACKEND}/auth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
    });
  } catch {
    return NextResponse.json({ error: 'Auth server unreachable.' }, { status: 503 });
  }

  if (!upstream.ok) {
    const status = upstream.status === 401 || upstream.status === 403 ? upstream.status : 502;
    return NextResponse.json({ error: 'Authentication failed.' }, { status });
  }

  const data = await upstream.json() as { access_token?: string };
  const token = data.access_token;
  if (!token) {
    return NextResponse.json({ error: 'Unexpected auth server response.' }, { status: 502 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set('token', token, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 86400,
    secure: IS_PROD,
  });
  return response;
}
