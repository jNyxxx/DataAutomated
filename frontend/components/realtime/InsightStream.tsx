'use client';

import { useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import type { SSEEvent } from '@/lib/types';
import { useToast } from '@/components/ui/Toast';

interface InsightStreamProps {
  onEvent?: (event: SSEEvent) => void;
}

export function InsightStream({ onEvent }: InsightStreamProps) {
  const router = useRouter();
  const { toast } = useToast();

  const processedEvents = useRef<Set<string>>(new Set());
  const lastEventIdRef = useRef<string | null>(null);

  const handleEvent = useCallback(
    (e: MessageEvent<string>) => {
      try {
        const lastEventId = e.lastEventId;
        if (lastEventId && processedEvents.current.has(lastEventId)) return;
        if (lastEventId) {
          processedEvents.current.add(lastEventId);
          lastEventIdRef.current = lastEventId;
        }

        const data = JSON.parse(e.data);
        // Call generic onEvent
        onEvent?.(data as SSEEvent);

        if (data.event_type?.startsWith('agent_job.')) {
          const jobType = data.payload?.job_type || data.job_type;
          const typeLabel = { voc: 'VoC', comp_signal: 'Competitive', journey: 'Journey' }[jobType as string] ?? jobType;
          if (data.event_type === 'agent_job.completed') {
            toast(`${typeLabel} analysis complete`, 'success');
            router.refresh();
          } else if (data.event_type === 'agent_job.failed') {
            toast(`${typeLabel} analysis failed`, 'error');
            router.refresh();
          } else if (data.event_type === 'agent_job.started') {
            toast(`${typeLabel} analysis started...`, 'info');
            router.refresh();
          }
          window.dispatchEvent(new CustomEvent('da:job', { detail: data }));
          return;
        }

        if (data.event_type?.startsWith('data_source.')) {
          if (data.event_type === 'data_source.sync_started') {
            toast(`Syncing ${data.payload?.source_type}...`, 'info');
          } else if (data.event_type === 'data_source.sync_completed') {
            toast(`Finished syncing ${data.payload?.source_type}`, 'success');
            router.refresh();
          } else if (data.event_type === 'data_source.sync_failed') {
            toast(`Failed to sync ${data.payload?.source_type}`, 'error');
          }
          return;
        }

        if (data.event_type?.endsWith('.created')) {
          const label =
            data.event_type === 'feedback_insight.created' ? 'New VoC insight available' :
            data.event_type === 'competitive_signal.created'  ? 'New competitive signal detected' :
            data.event_type === 'journey_insight.created' ? 'Journey data updated' : 
            data.event_type === 'raw_feedback.created' ? 'New raw feedback received' : 
            data.event_type === 'report.created' ? 'New report generated and ready for download' : null;
          if (label) {
            toast(label, 'success');
            router.refresh();
          }
        }
      } catch {
        // ignore malformed frames
      }
    },
    [onEvent, router, toast],
  );

  useEffect(() => {
    let source: EventSource | null = null;
    let reconnectTimeout: ReturnType<typeof setTimeout>;
    let retryCount = 0;

    const connect = () => {
      let url = '/api/stream';
      if (lastEventIdRef.current) {
        url += `?lastEventId=${encodeURIComponent(lastEventIdRef.current)}`;
      }
      source = new EventSource(url);

      // Listeners for all event types we care about since backend uses custom event names
      const events = [
        'raw_feedback.created', 'feedback_insight.created', 'competitive_signal.created',
        'journey_event.created', 'journey_insight.created', 'agent_job.started',
        'agent_job.completed', 'agent_job.failed', 'data_source.sync_started',
        'data_source.sync_completed', 'data_source.sync_failed', 'report.created'
      ];

      events.forEach(ev => source?.addEventListener(ev, handleEvent as EventListener));

      source.addEventListener('heartbeat', () => {
        // Heartbeat received
      });

      // Named SSE `event: error` frames (queue_full / resync_required) sent by the
      // server when the in-process queue overflows.  These are distinct from the
      // EventSource connection-level onerror — distinguished by instanceof MessageEvent.
      source.addEventListener('error', (e: Event) => {
        if (!(e instanceof MessageEvent)) return; // connection error handled by onerror
        try {
          const data = JSON.parse((e as MessageEvent<string>).data);
          if (data.error === 'queue_full' || data.disconnect || data.resync_required) {
            // State is unreliable — hard-refetch all server components immediately.
            router.refresh();
          }
        } catch { /* ignore malformed frames */ }
      });

      source.onopen = () => {
        retryCount = 0; // Reset backoff
      };

      source.onerror = () => {
        source?.close();
        // Exponential backoff reconnect
        const backoff = Math.min(1000 * Math.pow(2, retryCount), 30000);
        retryCount++;
        reconnectTimeout = setTimeout(connect, backoff);
      };
    };

    connect();

    return () => {
      source?.close();
      clearTimeout(reconnectTimeout);
    };
  }, [handleEvent]);

  return null;
}
