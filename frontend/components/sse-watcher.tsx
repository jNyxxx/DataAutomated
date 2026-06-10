'use client';

import { useEffect, useState } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000';

function getToken(): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(/(?:^|;\s*)token=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

interface Toast {
  id: number;
  message: string;
}

export default function SseWatcher() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    const token = getToken();
    if (!token) return;

    const es = new EventSource(`${API_URL}/stream/insights?token=${encodeURIComponent(token)}`);

    es.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data as string) as { narrative?: string };
        const msg = data.narrative
          ? `New insight: ${data.narrative.slice(0, 80)}…`
          : 'New insight available';
        const id = Date.now();
        setToasts((prev) => [...prev, { id, message: msg }]);
        setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 6000);
      } catch {
        // ignore parse errors
      }
    };

    return () => es.close();
  }, []);

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
