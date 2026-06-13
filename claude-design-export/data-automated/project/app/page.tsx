import { Settings } from "lucide-react";
import { Badge, type BadgeProps } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { DateRangeButton } from "@/components/ui/Field";
import { KpiCards } from "@/components/dashboard/KpiCards";
import { NeedsAttentionQueue } from "@/components/dashboard/NeedsAttentionQueue";
import {
  VocPreview,
  CompetitivePreview,
  JourneyPreview,
} from "@/components/dashboard/StreamPreviews";
import {
  getDashboardSummary,
  type DashboardSummary,
  type RunStatus,
  type SourceState,
} from "@/lib/api";

const RUN_BADGE: Record<RunStatus, { label: string; variant: BadgeProps["variant"] }> = {
  ok: { label: "OK", variant: "success" },
  running: { label: "SYNCING", variant: "info" },
  error: { label: "ERROR", variant: "critical" },
};

const SOURCE_BADGE: Record<SourceState, { label: string; variant: BadgeProps["variant"] }> = {
  ok: { label: "OK", variant: "success" },
  syncing: { label: "SYNCING", variant: "info" },
  stale: { label: "STALE", variant: "warning" },
  error: { label: "ERROR", variant: "critical" },
  off: { label: "OFF", variant: "neutral" },
};

export default async function DashboardPage() {
  // All data routes through lib/api → JWT + X-Tenant-Id attached server-side.
  const res = await Promise.allSettled([getDashboardSummary()]);
  const data: DashboardSummary | null = res[0].status === "fulfilled" ? res[0].value : null;

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      {/* Header */}
      <header className="flex flex-wrap items-center gap-4">
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-semibold tracking-tight text-white">Dashboard</h1>
          <p className="mt-0.5 truncate text-sm text-slate-400">Acme SaaS Inc. · all data live</p>
        </div>
        <div className="ml-auto">
          <DateRangeButton>Last 30 days</DateRangeButton>
        </div>
      </header>

      {/* KPI row */}
      <div className="mt-5">
        <KpiCards kpis={data?.kpis ?? []} />
      </div>

      {/* Needs attention */}
      <div className="mt-5">
        <NeedsAttentionQueue items={data?.attention ?? []} />
      </div>

      {/* Intelligence streams — 2-up, with Journey full width below */}
      <div className="mt-5 grid grid-cols-1 gap-4 xl:grid-cols-2">
        {data && <VocPreview data={data.voc} />}
        {data && <CompetitivePreview data={data.competitive} />}
        {data && <JourneyPreview data={data.journey} />}
      </div>

      {/* System health */}
      <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <AgentRuns data={data} />
        <SourceHealth data={data} />
      </div>
    </div>
  );
}

/* ----------------------------- system panels ----------------------------- */

function AgentRuns({ data }: { data: DashboardSummary | null }) {
  const runs = data?.agent_runs ?? [];
  return (
    <section className="rounded-xl bg-slate-800 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)] p-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="truncate text-sm font-semibold text-white">Agent runs</h2>
        <span className="shrink-0 text-xs text-slate-400">last 24h</span>
      </div>
      <ul className="divide-y divide-white/5">
        {runs.map((r) => {
          const b = RUN_BADGE[r.status];
          return (
            <li key={r.id} className="flex items-center gap-3 py-2.5 text-sm">
              <span className="min-w-0 flex-1 truncate text-slate-200">{r.name}</span>
              <span className="shrink-0 text-xs text-slate-400">{r.when}</span>
              <Badge variant={b.variant} dot>
                {b.label}
              </Badge>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function SourceHealth({ data }: { data: DashboardSummary | null }) {
  const sources = data?.sources ?? [];
  return (
    <section className="rounded-xl bg-slate-800 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)] p-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="truncate text-sm font-semibold text-white">Source health</h2>
        <Button variant="ghost" size="sm">
          <Settings className="size-4" />
          Manage
        </Button>
      </div>
      <ul className="divide-y divide-white/5">
        {sources.map((s) => {
          const b = SOURCE_BADGE[s.state];
          return (
            <li key={s.id} className="flex items-center gap-3 py-2.5 text-sm">
              <div className="min-w-0 flex-1">
                <p className="truncate text-slate-200">{s.name}</p>
                <p className="truncate text-xs text-slate-400">{s.detail}</p>
              </div>
              <Badge variant={b.variant} dot>
                {b.label}
              </Badge>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
