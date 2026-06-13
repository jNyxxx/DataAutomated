/**
 * Same-origin backend proxy (CLAUDE.md §14 P2.8).
 *
 * Reads the HttpOnly `token` cookie server-side and forwards the request to
 * the FastAPI backend with `Authorization: Bearer`.  Browser JS never holds
 * the JWT after the HttpOnly migration; client components call `/api/backend/…`
 * instead of the bare backend URL.
 *
 * SSE (/stream/insights) is NOT proxied here — the sse-watcher obtains a
 * short-lived ticket via POST /api/backend/api/sse-ticket and connects the
 * EventSource directly to the backend stream URL with ?ticket=…  (the ticket
 * is single-use and 60s-lived, safe to appear in a URL per CLAUDE.md §14).
 */
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';

const BACKEND =
  process.env.API_URL_INTERNAL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000';

type RouteContext = { params: Promise<{ path: string[] }> };

async function proxy(request: NextRequest, path: string[]): Promise<NextResponse> {
  const cookieStore = await cookies();
  const token = cookieStore.get('token')?.value;
  if (!token) {
    return NextResponse.json({ detail: 'Not authenticated.' }, { status: 401 });
  }

  // Build upstream URL, preserving any query-string the caller passed.
  const upstream = new URL(`${BACKEND}/${path.join('/')}`);
  request.nextUrl.searchParams.forEach((value, key) => {
    upstream.searchParams.set(key, value);
  });

  const headers = new Headers();
  headers.set('Authorization', `Bearer ${token}`);
  const ct = request.headers.get('content-type');
  if (ct) headers.set('Content-Type', ct);

  const hasBody = !['GET', 'HEAD'].includes(request.method);
  const body = hasBody ? await request.text() : undefined;

  let res: Response;
  try {
    res = await fetch(upstream.toString(), {
      method: request.method,
      headers,
      body,
    });
  } catch {
    return NextResponse.json({ detail: 'Backend unreachable.' }, { status: 503 });
  }

  const responseBody = await res.text();
  return new NextResponse(responseBody, {
    status: res.status,
    headers: {
      'Content-Type': res.headers.get('content-type') ?? 'application/json',
    },
  });
}

export async function GET(req: NextRequest, ctx: RouteContext) {
  const { path } = await ctx.params;
  return proxy(req, path);
}

export async function POST(req: NextRequest, ctx: RouteContext) {
  const { path } = await ctx.params;
  return proxy(req, path);
}

export async function PATCH(req: NextRequest, ctx: RouteContext) {
  const { path } = await ctx.params;
  return proxy(req, path);
}

export async function DELETE(req: NextRequest, ctx: RouteContext) {
  const { path } = await ctx.params;
  return proxy(req, path);
}

export async function PUT(req: NextRequest, ctx: RouteContext) {
  const { path } = await ctx.params;
  return proxy(req, path);
}
