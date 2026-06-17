import { NextRequest, NextResponse } from 'next/server';
import { getTokenServerSide } from '@/lib/auth';

export async function GET(_request: NextRequest) {
  const token = await getTokenServerSide();
  if (!token) return new NextResponse('Unauthorized', { status: 401 });

  const configured = process.env.API_URL_INTERNAL;
  if (!configured && process.env.NODE_ENV === 'production') {
    return new NextResponse('Server misconfiguration: API_URL_INTERNAL not set', { status: 503 });
  }
  const backendUrl = configured ?? 'http://localhost:8000';

  // Step 1: exchange JWT for a single-use SSE ticket.
  // The backend's /stream/insights only accepts ?ticket= or ?token= query params
  // (not an Authorization header) because EventSource doesn't support custom headers.
  const ticketRes = await fetch(`${backendUrl}/api/sse-ticket`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  }).catch(() => null);

  if (!ticketRes?.ok) {
    return new NextResponse('Unauthorized', { status: 401 });
  }
  const { ticket } = (await ticketRes.json()) as { ticket: string };

  // Step 2: open the SSE stream using the ticket query param.
  const upstream = await fetch(
    `${backendUrl}/stream/insights?ticket=${encodeURIComponent(ticket)}`,
    { headers: { Accept: 'text/event-stream', 'Cache-Control': 'no-cache' } },
  ).catch(() => null);

  if (!upstream || !upstream.ok || !upstream.body) {
    return new NextResponse('Backend SSE unavailable', { status: 502 });
  }

  return new NextResponse(upstream.body, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
