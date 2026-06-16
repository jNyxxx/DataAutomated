'use client';

import { useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import type { SSEEvent } from '@/lib/types';
import { useToast } from '@/components/ui/Toast';

interface InsightStreamProps {
  onEvent?: (event: SSEEvent) => void;
}

export function InsightStream({ onEvent }: InsightStreamProps) {
  const router = useRouter();
  const { toast } = useToast();

  const handleMessage = useCallback(
    (e: MessageEvent<string>) => {
      try {
        const event = JSON.parse(e.data) as SSEEvent;
        onEvent?.(event);

        if (event.event_type === 'job') {
          const typeLabel = { voc: 'VoC', comp_signal: 'Competitive', journey: 'Journey' }[event.job_type] ?? event.job_type;
          if (event.status === 'succeeded') {
            toast(`${typeLabel} analysis complete`, 'success');
          } else {
            toast(`${typeLabel} analysis failed`, 'error');
          }
          window.dispatchEvent(new CustomEvent('da:job', { detail: event }));
          router.refresh();
          return;
        }

        const label =
          event.event_type === 'insight' ? 'New VoC insight available' :
          event.event_type === 'signal'  ? 'New competitive signal detected' :
                                           'Journey data updated';
        toast(label, 'info');
        router.refresh();
      } catch {
        // ignore malformed frames
      }
    },
    [onEvent, router, toast],
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
