"use client";

import * as React from "react";
import { Check, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { type GenNode, type NodeStatus } from "@/hooks/useGenerationStream";

/**
 * Active, controlled progress UI for long-running (~2 min) report generation.
 * Presentational only — feed it `nodes` + `percent` (e.g. from useGenerationStream).
 */
export function GenerationProgress({
  nodes,
  percent,
  className,
}: {
  nodes: GenNode[];
  percent: number;
  className?: string;
}) {
  const clamped = Math.max(0, Math.min(100, Math.round(percent)));
  const active = nodes.find((n) => n.status === "active");

  return (
    <div className={cn("space-y-4", className)}>
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="flex min-w-0 items-center gap-2 font-medium text-slate-200">
          <Loader2 className="size-4 shrink-0 animate-spin text-blue-400" />
          <span className="truncate">{active ? active.label : "Finalizing…"}</span>
        </span>
        <span className="shrink-0 tabular-nums text-slate-400">{clamped}%</span>
      </div>

      <div className="h-2 overflow-hidden rounded-full bg-slate-700/60">
        <div
          className="relative h-full rounded-full bg-blue-500 transition-[width] duration-700 ease-out"
          style={{ width: `${clamped}%` }}
        >
          <span className="absolute inset-0 animate-pulse rounded-full bg-white/20" />
        </div>
      </div>

      <ol className="space-y-2">
        {nodes.map((n) => (
          <li key={n.id} className="flex items-center gap-3 text-sm">
            <NodeMarker status={n.status} />
            <span
              className={cn(
                "truncate",
                n.status === "done" && "text-slate-400 line-through decoration-slate-600",
                n.status === "active" && "font-medium text-slate-100",
                n.status === "pending" && "text-slate-500",
              )}
            >
              {n.label}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function NodeMarker({ status }: { status: NodeStatus }) {
  if (status === "done")
    return (
      <span className="grid size-5 shrink-0 place-items-center rounded-full bg-blue-500/15 text-blue-400">
        <Check className="size-3" />
      </span>
    );
  if (status === "active")
    return (
      <span className="grid size-5 shrink-0 place-items-center rounded-full bg-blue-500/15">
        <span className="size-2 animate-pulse rounded-full bg-blue-400" />
      </span>
    );
  return <span className="size-5 shrink-0 rounded-full ring-1 ring-inset ring-slate-700" />;
}
