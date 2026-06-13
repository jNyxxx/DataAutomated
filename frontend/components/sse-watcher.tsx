'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

// EventSource URL must be browser-reachable; only the short-lived ticket (not
// the JWT) appears here — acceptable per CLAUDE.md §14 P2.8.
const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000';

interface Toast {
  id: number;
  message: string;
}

export default function SseWatcher() {
  const [toasts, setToasts] = useState<Toast[]>([]);
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
            const id = Date.now();
            setToasts((prev) => [...prev, { id, message: msg }]);
            setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 6000);
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
  }, [router]);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 flex flex-col gap-2 z-50">
      {toasts.map((t) => (
        <div
          key={t.id}
          className="bg-indigo-600 text-white text-sm px-4 py-3 rounded shadow-lg max-w-sm"
        >
          {t.message}
        </div>
      ))}
    </div>
  );
}
