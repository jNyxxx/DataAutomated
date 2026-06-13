import { Sparkles, BarChart3 } from "lucide-react";
import { Badge, type BadgeProps } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { FilterSelect } from "@/components/ui/Field";
import { EmptyState } from "@/components/ui/EmptyState";
import { FunnelChart } from "@/components/journeys/FunnelChart";
import { focusRing } from "@/lib/utils";
import {
  getJourneyInsights,
  type JourneyInsights,
  type Confidence,
} from "@/lib/api";

const CONFIDENCE_BADGE: Record<Confidence, { label: string; variant: BadgeProps["variant"] }> = {
  high: { label: "High", variant: "success" },
  med: { label: "Medium", variant: "warning" },
  low: { label: "Low", variant: "neutral" },
};

const rootCauseVariant = (token: string): BadgeProps["variant"] =>
  token === "ux_friction" ? "high" : token === "messaging" ? "info" : "warning";

export default async function JourneysPage() {
  // All data routes through lib/api → JWT + tenant headers attached server-side.
  const res = await Promise.allSettled([getJourneyInsights()]);
  const jx: JourneyInsights | null = res[0].status === "fulfilled" ? res[0].value : null;

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      {/* Header */}
      <header className="flex flex-wrap items-center gap-4">
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-semibold tracking-tight text-white">
            Journey Intelligence
          </h1>
          <p className="mt-0.5 truncate text-sm text-slate-400">
            {jx ? `${jx.funnel_name} funnel · Acme SaaS Inc.` : "Activation funnel · Acme SaaS Inc."}
          </p>
        </div>
      </header>

      {/* Filters — inset wells */}
      <div className="mt-5 flex flex-wrap items-center gap-2">
        <FilterSelect label="Funnel" options={["Activation", "Onboarding", "Expansion"]} />
        <FilterSelect label="Segment" options={["All", "Growth cohort", "Enterprise", "SMB"]} />
        <FilterSelect label="Device" options={["All", "Desktop", "Tablet", "Mobile"]} />
      </div>

      {/* 1 · AI Friction Diagnosis — elevated "why" above the charts */}
      <FrictionDiagnosis jx={jx} />

      {/* 2 · Split view: funnel + device breakdown */}
      <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-3">
        <section className="rounded-xl bg-slate-800 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)] p-5 lg:col-span-2">
          <div className="mb-4 flex items-baseline justify-between gap-3">
            <h2 className="truncate text-sm font-semibold text-white">Activation funnel</h2>
            <span className="shrink-0 text-xs text-slate-400">drop-off by step · 30d</span>
          </div>
          <FunnelChart steps={jx?.funnel ?? []} />
        </section>

        <DeviceDropoff jx={jx} />
      </div>

      {/* 3 · Recommended actions */}
      <RecommendedActions jx={jx} />

      {/* 4 · Segments — real empty state, no placeholder/demo block */}
      <Segments jx={jx} />
    </div>
  );
}

/* ------------------------------- sections -------------------------------- */

function FrictionDiagnosis({ jx }: { jx: JourneyInsights | null }) {
  const d = jx?.diagnosis;
  return (
    <section className="mt-5 w-full rounded-xl bg-slate-800 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)] p-5 sm:p-6">
      <div className="mb-3 flex items-center gap-2 text-xs font-medium text-blue-400">
        <Sparkles className="size-4" />
        AI Friction Diagnosis
      </div>

      {d ? (
        <>
          <p className="max-w-4xl text-lg leading-relaxed text-slate-300">
            The biggest activation leak is{" "}
            <span className="font-semibold text-white">{d.location}</span>, where drop-off hit{" "}
            <span className="font-semibold text-white">{d.dropoff_pct}%</span>. Root cause:{" "}
            <span className="font-semibold text-white">{d.root_cause_label}</span> ({d.detail}) —
            putting <span className="font-semibold text-white">{d.revenue_at_risk}</span> at risk
            across{" "}
            <span className="font-semibold text-white">
              {d.affected_sessions.toLocaleString()}
            </span>{" "}
            sessions.
          </p>

          <dl className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Stat label="Root cause">
              <Badge variant={rootCauseVariant(d.root_cause)} dot>
                {d.root_cause}
              </Badge>
            </Stat>
            <Stat label="Friction score" value={d.friction_score.toFixed(2)} />
            <Stat label="Revenue at risk" value={d.revenue_at_risk} accent="text-rose-400" />
            <Stat label="Affected sessions" value={d.affected_sessions.toLocaleString()} />
          </dl>
        </>
      ) : (
        <p className="text-lg text-slate-400">
          The friction diagnosis will appear here once funnel data has been analyzed.
        </p>
      )}
    </section>
  );
}

function Stat({
  label,
  value,
  accent = "text-white",
  children,
}: {
  label: string;
  value?: string;
  accent?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="min-w-0">
      <dt className="truncate text-xs text-slate-400">{label}</dt>
      <dd className="mt-1">
        {children ?? <span className={`text-lg font-semibold tabular-nums ${accent}`}>{value}</span>}
      </dd>
    </div>
  );
}

function DeviceDropoff({ jx }: { jx: JourneyInsights | null }) {
  const devices = jx?.device_dropoff ?? [];
  return (
    <section className="rounded-xl bg-slate-800 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)] p-5">
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <h2 className="truncate text-sm font-semibold text-white">Drop-off by device</h2>
        <span className="shrink-0 text-xs text-slate-400">30d</span>
      </div>
      <ul className="space-y-4">
        {devices.map((dv) => (
          <li key={dv.device}>
            <div className="mb-1.5 flex items-center justify-between gap-3 text-sm">
              <span className="truncate text-slate-300">{dv.device}</span>
              <span className="shrink-0 font-medium tabular-nums text-slate-200">{dv.pct}%</span>
            </div>
            <div className="h-2.5 overflow-hidden rounded-full bg-slate-700/60">
              <div
                className="h-full rounded-full bg-blue-500/80"
                style={{ width: `${Math.max(2, Math.min(100, dv.pct))}%` }}
              />
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function RecommendedActions({ jx }: { jx: JourneyInsights | null }) {
  const recs = jx?.recommendations ?? [];
  return (
    <section className="mt-5 w-full rounded-xl bg-slate-800 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)] p-5">
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold text-white">Recommended actions</h2>
          <p className="truncate text-xs text-slate-400">prioritized by projected lift</p>
        </div>
      </div>

      <div className="-mx-2 overflow-x-auto px-2">
        <table className="w-full min-w-[640px] border-separate border-spacing-0 text-sm">
          <thead>
            <tr className="text-left text-xs font-medium uppercase tracking-wider text-slate-400">
              <th className="px-3 py-2 font-medium">Recommendation</th>
              <th className="px-3 py-2 font-medium">Root cause</th>
              <th className="px-3 py-2 font-medium">Confidence</th>
              <th className="px-3 py-2 text-right font-medium">Projected lift</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody className="[&>tr]:border-t [&>tr]:border-white/5">
            {recs.map((r) => {
              const c = CONFIDENCE_BADGE[r.confidence];
              return (
                <tr key={r.id} className="group transition-colors hover:bg-slate-700/30">
                  <td className="max-w-[320px] px-3 py-3">
                    <span className="block truncate font-medium text-slate-100">{r.title}</span>
                  </td>
                  <td className="px-3 py-3">
                    <Badge variant={rootCauseVariant(r.root_cause)} dot>
                      {r.root_cause}
                    </Badge>
                  </td>
                  <td className="px-3 py-3">
                    <Badge variant={c.variant} dot>
                      {c.label}
                    </Badge>
                  </td>
                  <td className="px-3 py-3 text-right">
                    <span className="font-semibold tabular-nums text-emerald-400">
                      {r.projected_lift}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-right">
                    <Button variant="default" size="sm">
                      Plan fix
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Segments({ jx }: { jx: JourneyInsights | null }) {
  const segments = jx?.segments ?? [];

  if (segments.length === 0) {
    return (
      <div className="mt-5">
        <EmptyState
          icon={BarChart3}
          title="No segment data yet"
          description="Connect a behavioral source (Mixpanel or Segment) to break this funnel down by cohort and segment."
          action={
            <a
              href="/settings"
              className={`inline-flex h-9 items-center rounded-lg bg-blue-600 px-4 text-sm font-medium text-white hover:bg-blue-500 ${focusRing}`}
            >
              Connect a source
            </a>
          }
        />
      </div>
    );
  }

  return (
    <section className="mt-5 w-full rounded-xl bg-slate-800 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)] p-5">
      <h2 className="mb-4 truncate text-sm font-semibold text-white">Conversion by segment</h2>
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {segments.map((s) => (
          <li key={s.id} className="rounded-lg bg-slate-900/50 p-4">
            <p className="truncate text-sm text-slate-300">{s.name}</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums text-white">{s.conversion}%</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
