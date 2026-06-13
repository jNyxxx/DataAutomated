'use client';

import { useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import type { SSEEvent } from '@/lib/types';

interface InsightStreamProps {
  onEvent?: (event: SSEEvent) => void;
}

export function InsightStream({ onEvent }: InsightStreamProps) {
  const router = useRouter();

  const handleMessage = useCallback(
    (e: MessageEvent<string>) => {
      try {
        const event = JSON.parse(e.data) as SSEEvent;
        onEvent?.(event);
        // Re-fetch Server Component data so new items appear without a full reload
        router.refresh();
      } catch {
        // ignore malformed frames
      }
    },
    [onEvent, router],
  );

  useEffect(() => {
    // Connects through the Next.js proxy route which handles auth via HttpOnly cookie
    const source = new EventSource('/api/stream');
    source.onmessage = handleMessage;
    source.onerror = () => source.close();
    return () => source.close();
  }, [handleMessage]);

  return null;
}
