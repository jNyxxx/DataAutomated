import { Sparkles, Plus } from "lucide-react";
import { Badge, type BadgeProps } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { FilterSelect } from "@/components/ui/Field";
import { SignalVelocityChart } from "@/components/signals/SignalVelocityChart";
import { focusRing } from "@/lib/utils";
import {
  getCompetitiveSignals,
  type CompetitiveSignals,
  type CompetitiveSignal,
  type SignalUrgency,
} from "@/lib/api";

/* ------------------------------- mappings -------------------------------- */
/* Only `critical` gets the high-contrast rose treatment — the rest escalate
   calmly so the feed doesn't scream. */
const URGENCY_BADGE: Record<SignalUrgency, { label: string; variant: BadgeProps["variant"] }> = {
  critical: { label: "Critical", variant: "critical" },
  high: { label: "High", variant: "high" },
  med: { label: "Medium", variant: "warning" },
  low: { label: "Low", variant: "neutral" },
};

export default async function SignalsPage() {
  // All data routes through lib/api → JWT + tenant headers attached server-side.
  const res = await Promise.allSettled([getCompetitiveSignals()]);
  const ci: CompetitiveSignals | null = res[0].status === "fulfilled" ? res[0].value : null;

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      {/* Header */}
      <header className="flex flex-wrap items-center gap-4">
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-semibold tracking-tight text-white">
            Competitive Signals
          </h1>
          <p className="mt-0.5 truncate text-sm text-slate-400">
            {ci ? `Tracking ${ci.tracked.length} competitors · Acme SaaS Inc.` : "Acme SaaS Inc."}
          </p>
        </div>
      </header>

      {/* Filters — inset wells */}
      <div className="mt-5 flex flex-wrap items-center gap-2">
        <FilterSelect label="Competitor" options={["All", "Northbeam", "Loop.io", "Vantix", "Brightline"]} />
        <FilterSelect label="Type" options={["All", "Pricing", "Hiring", "Product", "Reviews", "News"]} />
        <FilterSelect label="Urgency" options={["All", "Critical", "High", "Medium", "Low"]} />
      </div>

      {/* Split feed: timeline + strategic rail */}
      <div className="mt-5 grid grid-cols-1 gap-5 xl:grid-cols-4">
        <div className="flex flex-col gap-4 xl:col-span-3">
          {(ci?.signals ?? []).map((s) => (
            <SignalCard key={s.id} signal={s} />
          ))}
        </div>

        <div className="flex flex-col gap-5 xl:col-span-1">
          <StrategicContext ci={ci} />
          <SignalVelocity ci={ci} />
          <TrackedCompetitors ci={ci} />
        </div>
      </div>
    </div>
  );
}

/* ------------------------------- signal ---------------------------------- */

function SignalCard({ signal }: { signal: CompetitiveSignal }) {
  const u = URGENCY_BADGE[signal.urgency];
  const isCritical = signal.urgency === "critical";

  return (
    <article
      className={`rounded-xl p-5 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)] ${isCritical ? "bg-rose-500/5" : "bg-slate-800"}`}
    >
      {/* Meta — urgency carries color; category + source stay neutral */}
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={u.variant} dot>
          {u.label}
        </Badge>
        <Badge variant="neutral">{signal.category}</Badge>
        <span className="ml-auto flex min-w-0 items-center gap-2 text-xs text-slate-400">
          <Badge variant="neutral">{signal.source}</Badge>
          <span className="truncate">{signal.when}</span>
        </span>
      </div>

      {/* Raw scraped headline */}
      <h3 className="mt-3 line-clamp-2 text-base font-semibold text-white">
        <span className="text-slate-300">{signal.competitor}</span> — {signal.title}
      </h3>

      {/* AI strategic interpretation — distinct, legible block */}
      <div className="mt-3 rounded-lg bg-slate-900/50 p-3.5">
        <div className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-blue-400">
          <Sparkles className="size-3.5" />
          Strategic context
        </div>
        <p className="line-clamp-3 text-sm font-normal leading-relaxed text-slate-300">
          {signal.context}
        </p>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <Button variant="default" size="sm">
          Mark read
        </Button>
        <Button variant="ghost" size="sm">
          Share to Slack
        </Button>
      </div>
    </article>
  );
}

/* -------------------------------- rail ----------------------------------- */

function StrategicContext({ ci }: { ci: CompetitiveSignals | null }) {
  const o = ci?.overview;
  const rows: [string, string, string?][] = [
    ["Signals (7d)", o ? String(o.signals_7d) : "—"],
    ["Critical open", o ? String(o.critical_open) : "—", "text-rose-400"],
    ["Top competitor", o?.top_competitor ?? "—"],
  ];
  return (
    <section className="rounded-xl bg-slate-800 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)] p-5">
      <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-blue-400">
        <Sparkles className="size-3.5" />
        Strategic context
      </div>
      <p className="line-clamp-3 text-sm font-normal leading-relaxed text-slate-300">
        {o?.positioning ?? "Positioning analysis appears here once signals are detected."}
      </p>
      <dl className="mt-3 divide-y divide-white/5">
        {rows.map(([k, v, accent]) => (
          <div key={k} className="flex items-center justify-between gap-3 py-2 text-sm">
            <dt className="truncate text-slate-400">{k}</dt>
            <dd className={`shrink-0 font-medium tabular-nums ${accent ?? "text-slate-200"}`}>
              {v}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function SignalVelocity({ ci }: { ci: CompetitiveSignals | null }) {
  return (
    <section className="rounded-xl bg-slate-800 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)] p-5">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="truncate text-sm font-semibold text-white">Signal velocity</h2>
        <span className="shrink-0 text-xs text-slate-400">per day</span>
      </div>
      <SignalVelocityChart data={ci?.velocity ?? []} />
    </section>
  );
}

function TrackedCompetitors({ ci }: { ci: CompetitiveSignals | null }) {
  const tracked = ci?.tracked ?? [];
  return (
    <section className="rounded-xl bg-slate-800 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)] p-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="truncate text-sm font-semibold text-white">Tracked competitors</h2>
        <button
          className={`inline-flex items-center gap-1 rounded text-xs font-medium text-blue-400 hover:text-blue-300 ${focusRing}`}
        >
          <Plus className="size-3.5" />
          Add
        </button>
      </div>
      <ul className="divide-y divide-white/5">
        {tracked.map((c) => (
          <li key={c.id} className="flex items-center justify-between gap-3 py-2 text-sm">
            <span className="truncate text-slate-200">{c.name}</span>
            <Badge variant="neutral">{c.signals} signals</Badge>
          </li>
        ))}
      </ul>
    </section>
  );
}
