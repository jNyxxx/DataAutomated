"use client";

import * as React from "react";
import { RefreshCw } from "lucide-react";
import { cn, focusRing } from "@/lib/utils";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/Toast";
import { retryJobAction } from "@/app/(dashboard)/settings/actions";
import type { AgentJob, AgentJobStatus } from "@/lib/types";
import { formatDistanceToNow } from "date-fns";

const JOB_TYPE_LABELS: Record<string, string> = {
  voc: "Voice-of-Customer",
  comp_signal: "Competitive Signals",
  journey: "Journey Analytics",
};

const STATUS_STYLES: Record<AgentJobStatus, { dot: string; text: string; label: string }> = {
  queued:    { dot: "bg-slate-400",  text: "text-slate-300", label: "Queued" },
  running:   { dot: "bg-blue-400 animate-pulse", text: "text-blue-300", label: "Running" },
  succeeded: { dot: "bg-green-400",  text: "text-green-300", label: "Succeeded" },
  failed:    { dot: "bg-yellow-400", text: "text-yellow-300", label: "Failed" },
  dead:      { dot: "bg-red-400",    text: "text-red-300",    label: "Dead" },
};

function JobRow({ job }: { job: AgentJob }) {
  const router = useRouter();
  const { toast } = useToast();
  const [loading, setLoading] = React.useState(false);

  const style = STATUS_STYLES[job.status] ?? STATUS_STYLES.queued;
  const canRetry = job.status === "failed" || job.status === "dead";
  const ts = job.completed_at ?? job.started_at ?? job.created_at;
  const timeAgo = ts ? `${formatDistanceToNow(new Date(ts))} ago` : "—";

  const handleRetry = async () => {
    setLoading(true);
    try {
      await retryJobAction(job.id);
      toast(`${JOB_TYPE_LABELS[job.job_type] ?? job.job_type} — retry queued`, "success");
      router.refresh();
    } catch {
      toast("Retry failed — check logs", "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <tr className="hover:bg-slate-700/30 transition-colors">
      <td className="px-3 py-2.5 text-slate-200">{JOB_TYPE_LABELS[job.job_type] ?? job.job_type}</td>
      <td className="px-3 py-2.5">
        <span className={cn("inline-flex items-center gap-1.5 text-xs font-medium", style.text)}>
          <span className={cn("size-1.5 rounded-full", style.dot)} />
          {style.label}
        </span>
      </td>
      <td className="px-3 py-2.5 text-slate-400 text-xs">{timeAgo}</td>
      <td className="px-3 py-2.5 text-slate-400 text-xs">{job.attempts}/{job.max_attempts}</td>
      <td className="px-3 py-2.5 max-w-[220px]">
        {job.last_error ? (
          <p className="truncate text-xs text-red-300" title={job.last_error}>{job.last_error}</p>
        ) : (
          <span className="text-xs text-slate-600">—</span>
        )}
      </td>
      <td className="px-3 py-2.5 text-right">
        {canRetry && (
          <button
            onClick={handleRetry}
            disabled={loading}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md bg-slate-700 px-2.5 py-1 text-xs font-medium text-slate-200",
              "hover:bg-slate-600 disabled:opacity-50 transition-colors",
              focusRing,
            )}
          >
            <RefreshCw className={cn("size-3", loading && "animate-spin")} />
            {loading ? "Retrying…" : "Retry"}
          </button>
        )}
      </td>
    </tr>
  );
}

export function SystemPanel({ jobs }: { jobs: AgentJob[] }) {
  if (jobs.length === 0) {
    return (
      <section className="mt-5 rounded-xl bg-slate-800 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)] p-5">
        <h2 className="text-sm font-semibold text-white mb-3">System — Agent Jobs</h2>
        <p className="text-sm text-slate-500">No agent jobs yet. Jobs appear here once an analysis is triggered.</p>
      </section>
    );
  }

  const deadCount = jobs.filter((j) => j.status === "dead").length;
  const failedCount = jobs.filter((j) => j.status === "failed").length;

  return (
    <section className="mt-5 rounded-xl bg-slate-800 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)] p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-white">System — Agent Jobs</h2>
          {(deadCount > 0 || failedCount > 0) && (
            <p className="mt-0.5 text-xs text-red-300">
              {deadCount > 0 && `${deadCount} dead`}
              {deadCount > 0 && failedCount > 0 && " · "}
              {failedCount > 0 && `${failedCount} awaiting retry`}
            </p>
          )}
        </div>
        <span className="text-xs text-slate-500">Last {jobs.length} runs</span>
      </div>
      <div className="-mx-2 overflow-x-auto px-2">
        <table className="w-full min-w-[640px] border-separate border-spacing-0 text-sm">
          <thead>
            <tr className="text-left text-xs font-medium uppercase tracking-wider text-slate-400">
              <th className="px-3 py-2 font-medium">Agent</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium">When</th>
              <th className="px-3 py-2 font-medium">Attempts</th>
              <th className="px-3 py-2 font-medium">Last error</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody className="[&>tr]:border-t [&>tr]:border-white/5">
            {jobs.map((job) => (
              <JobRow key={job.id} job={job} />
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
