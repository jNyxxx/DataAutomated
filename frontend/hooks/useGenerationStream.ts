"use client";

import * as React from "react";
import { getReports } from "@/lib/api";

export type NodeStatus = "pending" | "active" | "done";
export interface GenNode {
  id: string;
  label: string;
  status: NodeStatus;
}

const POLL_INTERVAL_MS = 3_000;
const TIMEOUT_MS = 90_000;
const TICK_THRESHOLDS = [25, 50, 75, 100];

/**
 * Polls /api/reports/list every 3s until the report with `reportId` reaches
 * status "ready" or the 90s timeout expires.
 *
 * The public interface is identical to the original SSE-based hook so that
 * GeneratingReportCard requires no changes.
 */
export function useGenerationStream(reportId: string | null, initial: GenNode[]) {
  const [nodes, setNodes] = React.useState<GenNode[]>(initial);
  const [percent, setPercent] = React.useState(0);
  const [done, setDone] = React.useState(false);
  const [error, setError] = React.useState<Error | null>(null);

  React.useEffect(() => {
    if (!reportId) return;

    let aborted = false;
    let tickIndex = 0;
    const startedAt = Date.now();

    const advanceNodes = (pct: number) => {
      const threshold = TICK_THRESHOLDS[Math.min(tickIndex, TICK_THRESHOLDS.length - 1)];
      if (pct >= threshold && tickIndex < initial.length) {
        setNodes((prev) =>
          prev.map((n, i) =>
            i < tickIndex + 1 ? { ...n, status: "done" } : i === tickIndex + 1 ? { ...n, status: "active" } : n,
          ),
        );
        tickIndex++;
      }
    };

    const poll = async () => {
      try {
        const reports = await getReports();
        if (aborted) return;

        const target = reports.find((r) => r.id === reportId);
        if (target?.status === "ready") {
          setPercent(100);
          setNodes((prev) => prev.map((n) => ({ ...n, status: "done" })));
          setDone(true);
          return;
        }

        const elapsed = Date.now() - startedAt;
        if (elapsed >= TIMEOUT_MS) {
          setError(new Error("Report generation timed out."));
          return;
        }

        const linearPct = Math.min(90, Math.round((elapsed / TIMEOUT_MS) * 90));
        setPercent(linearPct);
        advanceNodes(linearPct);

        setTimeout(poll, POLL_INTERVAL_MS);
      } catch (err) {
        if (!aborted) {
          setError(err instanceof Error ? err : new Error("polling failed"));
        }
      }
    };

    setTimeout(poll, POLL_INTERVAL_MS);

    return () => {
      aborted = true;
    };
  }, [reportId]);

  return { nodes, percent, done, error };
}
