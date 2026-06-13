import { NextRequest, NextResponse } from 'next/server';
import { getTokenServerSide } from '@/lib/auth';

export async function GET(_request: NextRequest) {
  const token = getTokenServerSide();
  if (!token) return new NextResponse('Unauthorized', { status: 401 });

  const backendUrl = process.env.API_URL_INTERNAL ?? 'http://localhost:8000';

  const upstream = await fetch(`${backendUrl}/stream/insights`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'text/event-stream',
      'Cache-Control': 'no-cache',
    },
  }).catch(() => null);

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
