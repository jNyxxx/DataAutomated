"use client";

import * as React from "react";
import { AlertTriangle } from "lucide-react";
import { focusRing } from "@/lib/utils";
import { getSourceHealth, type SourceHealth } from "@/lib/api";

/**
 * Global error / disconnect surface — lives at the very top of the root layout.
 *
 * A broken integration is a FATAL condition: the banner is NOT dismissible.
 * It polls the source-health endpoint and disappears only once every source
 * reports `is_active: true`.
 */
export function AlertBanner({ pollMs = 15_000 }: { pollMs?: number }) {
  const [down, setDown] = React.useState<SourceHealth[]>([]);

  React.useEffect(() => {
    let mounted = true;
    const poll = async () => {
      try {
        const sources = await getSourceHealth();
        if (mounted) setDown(sources.filter((s) => !s.is_active));
      } catch {
        // Network failure to the health endpoint is itself a degraded state,
        // but we avoid a false-positive banner; the next poll will reconcile.
      }
    };
    poll();
    const id = setInterval(poll, pollMs);
    return () => {
      mounted = false;
      clearInterval(id);
    };
  }, [pollMs]);

  if (down.length === 0) return null;

  return (
    <div role="alert" aria-live="assertive" className="flex flex-col">
      {down.map((s) => (
        <div
          key={s.id}
          className="flex items-center gap-3 bg-red-500/10 px-4 py-2.5 text-sm text-red-200 ring-1 ring-inset ring-red-500/20"
        >
          <AlertTriangle className="size-4 shrink-0 text-red-400" />
          <p className="min-w-0 flex-1 truncate">
            {s.message ?? `${s.name} integration is down — ingestion is paused.`}
          </p>
          <a
            href="/settings"
            className={`shrink-0 rounded-md bg-red-500/15 px-2.5 py-1 text-xs font-medium text-red-200 hover:bg-red-500/25 ${focusRing}`}
          >
            Reconnect
          </a>
        </div>
      ))}
    </div>
  );
}
