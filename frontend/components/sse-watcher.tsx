'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/components/ui/Toast';

// EventSource URL must be browser-reachable; only the short-lived ticket (not
// the JWT) appears here — acceptable per CLAUDE.md §14 P2.8.
const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000';

export default function SseWatcher() {
  const { toast } = useToast();
  const router = useRouter();
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    let es: EventSource | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;

    async function connect() {
      try {
        // Exchange the HttpOnly cookie for a 60s single-use ticket via the same-origin
        // proxy — the proxy reads the cookie server-side, no JWT is exposed to JS.
        const res = await fetch('/api/backend/api/sse-ticket', { method: 'POST' });
        if (!res.ok) return;
        const data = await res.json() as { ticket?: string };
        if (!data.ticket) return;
        if (!mountedRef.current) return;

        es = new EventSource(
          `${BACKEND_URL}/stream/insights?ticket=${encodeURIComponent(data.ticket)}`
        );

        es.onmessage = (e) => {
          try {
            const payload = JSON.parse(e.data as string) as {
              event_type?: string;
              narrative?: string;
              competitor_name?: string;
              signal_type?: string;
              funnel_step?: string;
            };
            let msg: string;
            if (payload.event_type === 'signal') {
              msg = payload.competitor_name
                ? `New signal: ${payload.competitor_name} — ${payload.signal_type ?? 'update'}`
                : 'New competitive signal detected';
            } else if (payload.event_type === 'journey') {
              msg = payload.funnel_step
                ? `New journey insight: ${payload.funnel_step}`
                : 'New journey intelligence available';
            } else {
              msg = payload.narrative
                ? `New insight: ${payload.narrative.slice(0, 80)}…`
                : 'New insight available';
            }
            toast(msg, 'info');
            router.refresh();
          } catch {
            // ignore parse errors
          }
        };

        es.onerror = () => {
          es?.close();
          es = null;
          if (mountedRef.current) {
            retryTimer = setTimeout(() => void connect(), 5000);
          }
        };
      } catch {
        // silently fail — SSE is best-effort; schedule a retry
        if (mountedRef.current) {
          retryTimer = setTimeout(() => void connect(), 5000);
        }
      }
    }

    void connect();

    return () => {
      mountedRef.current = false;
      clearTimeout(retryTimer);
      es?.close();
    };
  }, [router, toast]);

  return null;
}
