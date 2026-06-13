import { Sparkles } from "lucide-react";
import { Badge, type BadgeProps } from "@/components/ui/Badge";
import { SearchInput, FilterSelect } from "@/components/ui/Field";
import {
  SentimentTrendChart,
  ChurnGauge,
  SentimentDonut,
} from "@/components/insights/InsightCharts";
import { focusRing } from "@/lib/utils";
import {
  getVocInsights,
  type VocInsights,
  type Sentiment,
  type Urgency,
} from "@/lib/api";

/* ------------------------------- mappings -------------------------------- */

const SENTIMENT_BADGE: Record<Sentiment, { label: string; variant: BadgeProps["variant"] }> = {
  pos: { label: "Positive", variant: "success" },
  neg: { label: "Negative", variant: "critical" },
  neu: { label: "Neutral", variant: "neutral" },
};

const URGENCY_BADGE: Record<Urgency, { label: string; variant: BadgeProps["variant"] }> = {
  high: { label: "High", variant: "high" },
  med: { label: "Medium", variant: "warning" },
  low: { label: "Low", variant: "neutral" },
};

/* --------------------------------- page ---------------------------------- */

export default async function InsightsPage() {
  // All data routes through lib/api → JWT + tenant headers attached server-side.
  const res = await Promise.allSettled([getVocInsights()]);
  const voc: VocInsights | null = res[0].status === "fulfilled" ? res[0].value : null;

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      {/* Header */}
      <header className="flex flex-wrap items-center gap-4">
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-semibold tracking-tight text-white">
            Voice of Customer
          </h1>
          <p className="mt-0.5 truncate text-sm text-slate-400">
            Sentiment, themes & churn signals · Acme SaaS Inc.
          </p>
        </div>
        <div className="ml-auto">
          <SearchInput placeholder="Search insights…" className="w-44 sm:w-64" />
        </div>
      </header>

      {/* Filters — inset wells, distinct from buttons */}
      <div className="mt-5 flex flex-wrap items-center gap-2">
        <FilterSelect label="Source" options={["All", "Zendesk", "Typeform", "Intercom", "G2"]} />
        <FilterSelect label="Sentiment" options={["All", "Positive", "Negative", "Neutral"]} />
        <FilterSelect label="Urgency" options={["All", "High", "Medium", "Low"]} />
      </div>

      {/* 1 · AI Executive Narrative — core value, full width, top of layout */}
      <ExecutiveNarrative voc={voc} />

      {/* 2 · Top charts */}
      <div className="mt-5 grid grid-cols-1 gap-5 md:grid-cols-3">
        <SentimentTrendCard voc={voc} />
        <ChurnRiskCard voc={voc} />
        <SentimentMixCard voc={voc} />
      </div>

      {/* 3 · Top themes (full width) */}
      <TopThemes voc={voc} />

      {/* 4 · Raw feedback sample */}
      <RawFeedback voc={voc} />
    </div>
  );
}

/* ------------------------------- sections -------------------------------- */

function ExecutiveNarrative({ voc }: { voc: VocInsights | null }) {
  return (
    <section className="mt-5 w-full rounded-xl bg-slate-800 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)] p-5 sm:p-6">
      <div className="mb-3 flex items-center gap-2 text-xs font-medium text-teal-400">
        <Sparkles className="size-4" />
        AI Executive Narrative
      </div>
      <p className="max-w-4xl text-lg leading-relaxed text-slate-300">
        {voc
          ? voc.narrative.map((span, i) =>
              span.emphasis ? (
                <span key={i} className="font-semibold text-white">
                  {span.text}
                </span>
              ) : (
                <span key={i}>{span.text}</span>
              ),
            )
          : "The executive narrative will appear here once insights have been synthesized."}
      </p>
    </section>
  );
}

function ChartCard({
  title,
  meta,
  children,
}: {
  title: string;
  meta?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl bg-slate-800 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)] p-5">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="truncate text-sm font-semibold text-white">{title}</h2>
        {meta && <span className="shrink-0 text-xs text-slate-400">{meta}</span>}
      </div>
      {children}
    </section>
  );
}

function SentimentTrendCard({ voc }: { voc: VocInsights | null }) {
  const score = voc?.sentiment_score ?? 0;
  const delta = voc?.sentiment_delta ?? 0;
  return (
    <ChartCard title="Sentiment trend" meta="30d">
      <div className="mb-1 flex items-baseline gap-2">
        <span className="text-2xl font-semibold tabular-nums text-white">
          {score > 0 ? "+" : ""}
          {score.toFixed(2)}
        </span>
        <span className={delta >= 0 ? "text-xs text-teal-400" : "text-xs text-rose-400"}>
          {delta >= 0 ? "▲" : "▼"} {Math.abs(delta).toFixed(2)} vs prev
        </span>
      </div>
      <SentimentTrendChart data={voc?.trend ?? []} />
    </ChartCard>
  );
}

function ChurnRiskCard({ voc }: { voc: VocInsights | null }) {
  const delta = voc?.churn_delta_pts ?? 0;
  return (
    <ChartCard title="Churn risk" meta="Growth cohort">
      <ChurnGauge value={voc?.churn_risk ?? 0} />
      <p className="mt-2 text-center text-xs text-slate-400">
        {delta >= 0 ? "▲" : "▼"} {Math.abs(delta)} pts vs last week
      </p>
    </ChartCard>
  );
}

function SentimentMixCard({ voc }: { voc: VocInsights | null }) {
  return (
    <ChartCard title="Sentiment mix" meta="all sources">
      <SentimentDonut mix={voc?.mix ?? { positive: 0, negative: 0, neutral: 0 }} />
    </ChartCard>
  );
}

function TopThemes({ voc }: { voc: VocInsights | null }) {
  const themes = voc?.themes ?? [];
  return (
    <section className="mt-5 w-full rounded-xl bg-slate-800 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)] p-5">
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <h2 className="truncate text-sm font-semibold text-white">Top themes</h2>
        <span className="shrink-0 text-xs text-slate-400">clustered · 30d</span>
      </div>
      <ul className="space-y-3">
        {themes.map((t) => {
          const u = URGENCY_BADGE[t.urgency];
          return (
            <li key={t.id} className="flex items-center gap-4">
              <div className="flex w-40 min-w-0 shrink-0 items-center gap-2 sm:w-56">
                <span className="truncate text-sm text-slate-200">{t.name}</span>
                <Badge variant={u.variant} dot className="shrink-0">
                  {u.label}
                </Badge>
              </div>
              <div className="h-2.5 min-w-0 flex-1 overflow-hidden rounded-full bg-slate-700/60">
                <div
                  className="h-full rounded-full bg-teal-500"
                  style={{ width: `${Math.max(2, Math.min(100, t.pct))}%` }}
                />
              </div>
              <span className="w-10 shrink-0 text-right text-sm tabular-nums text-slate-300">
                {t.count}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function RawFeedback({ voc }: { voc: VocInsights | null }) {
  const feedback = voc?.feedback ?? [];
  return (
    <section className="mt-5 w-full rounded-xl bg-slate-800 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)] p-5">
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold text-white">Raw feedback sample</h2>
          <p className="truncate text-xs text-slate-400">processed in transit · not persisted</p>
        </div>
        <button className={`rounded text-xs font-medium text-teal-400 hover:text-teal-300 ${focusRing}`}>
          Export
        </button>
      </div>

      <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {feedback.map((f) => {
          const s = SENTIMENT_BADGE[f.sentiment];
          const u = URGENCY_BADGE[f.urgency];
          return (
            <li key={f.id}>
              <button
                className={`flex w-full flex-col gap-2 rounded-lg bg-slate-900/50 p-4 text-left transition-colors hover:bg-slate-900/80 ${focusRing}`}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={s.variant} dot>
                    {s.label}
                  </Badge>
                  <Badge variant={u.variant} dot>
                    {u.label}
                  </Badge>
                  <span className="ml-auto truncate text-xs text-slate-400">
                    {f.source} · {f.theme} · {f.when}
                  </span>
                </div>
                <p className="line-clamp-2 text-sm leading-relaxed text-slate-300">{f.text}</p>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
