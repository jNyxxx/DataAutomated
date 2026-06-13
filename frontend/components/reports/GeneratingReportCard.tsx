"use client";

import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { GenerationProgress } from "@/components/reports/GenerationProgress";
import { useGenerationStream, type GenNode } from "@/hooks/useGenerationStream";

const PIPELINE: GenNode[] = [
  { id: "ingest", label: "Synthesizing sources", status: "pending" },
  { id: "themes", label: "Clustering themes & signals", status: "pending" },
  { id: "narrative", label: "Drafting executive narrative", status: "pending" },
  { id: "render", label: "Rendering PDF + Slack digest", status: "pending" },
];

/**
 * Live "report is generating" card. Driven entirely by the authenticated
 * SSE stream — nodes + percent update as the FastAPI pipeline emits events.
 */
export function GeneratingReportCard({
  reportId,
  reportTitle,
}: {
  reportId: string;
  reportTitle: string;
}) {
  const { nodes, percent, error } = useGenerationStream(reportId, PIPELINE);

  return (
    <section className="rounded-xl bg-slate-800 p-5">
      <div className="mb-4 flex items-center gap-3">
        <Badge variant="warning" dot>
          Generating
        </Badge>
        <h2 className="min-w-0 truncate text-sm font-medium text-white">{reportTitle}</h2>
        <span className="ml-auto shrink-0 text-xs text-slate-400">
          ~2 min · runs in background
        </span>
      </div>

      {error ? (
        <p className="text-sm text-red-300">
          Generation stream interrupted — retrying automatically.
        </p>
      ) : (
        <GenerationProgress nodes={nodes} percent={percent} />
      )}

      <div className="mt-4 flex gap-2">
        <Button variant="default" size="sm">
          Notify me when ready
        </Button>
        <Button variant="ghost" size="sm">
          Cancel
        </Button>
      </div>
    </section>
  );
}
