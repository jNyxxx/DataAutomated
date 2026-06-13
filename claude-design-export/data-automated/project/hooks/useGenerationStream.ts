"use client";

import * as React from "react";
import { fetchEventSource } from "@microsoft/fetch-event-source";
import { authHeaders, reportStreamUrl } from "@/lib/api";

export type NodeStatus = "pending" | "active" | "done";
export interface GenNode {
  id: string;
  label: string;
  status: NodeStatus;
}

/**
 * Subscribe to the report-generation stream.
 *
 * Native EventSource cannot send an Authorization header, but our FastAPI
 * backend requires a JWT Bearer token — so we drive the stream with
 * @microsoft/fetch-event-source and attach the auth + tenant headers
 * explicitly via lib/api.ts.
 *
 * Server emits:
 *   event: node      data: { "id": "...", "status": "done" }
 *   event: progress  data: { "percent": 42 }
 *   event: done      data: {}
 */
export function useGenerationStream(reportId: string | null, initial: GenNode[]) {
  const [nodes, setNodes] = React.useState<GenNode[]>(initial);
  const [percent, setPercent] = React.useState(0);
  const [done, setDone] = React.useState(false);
  const [error, setError] = React.useState<Error | null>(null);

  React.useEffect(() => {
    if (!reportId) return;
    const ctrl = new AbortController();

    (async () => {
      try {
        const headers = await authHeaders();
        await fetchEventSource(reportStreamUrl(reportId), {
          method: "GET",
          headers: { ...headers, Accept: "text/event-stream" },
          signal: ctrl.signal,
          openWhenHidden: true,
          onmessage(ev) {
            if (!ev.data) return;
            if (ev.event === "node") {
              const { id, status } = JSON.parse(ev.data) as {
                id: string;
                status: NodeStatus;
              };
              setNodes((prev) =>
                prev.map((n) => (n.id === id ? { ...n, status } : n)),
              );
            } else if (ev.event === "progress") {
              setPercent(JSON.parse(ev.data).percent);
            } else if (ev.event === "done") {
              setPercent(100);
              setDone(true);
              ctrl.abort();
            }
          },
          onerror(err) {
            // Throwing stops the built-in retry loop; surface it to the UI.
            setError(err instanceof Error ? err : new Error("stream failed"));
            throw err;
          },
        });
      } catch (err) {
        if (!ctrl.signal.aborted) {
          setError(err instanceof Error ? err : new Error("stream failed"));
        }
      }
    })();

    return () => ctrl.abort();
  }, [reportId]);

  return { nodes, percent, done, error };
}
