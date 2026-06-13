import { getTokenServerSide } from '@/lib/auth';
import { fetchInsights } from '@/lib/api';
import { Header } from '@/components/layout/Header';
import { Sparkline, Donut, Gauge } from '@/components/ui/charts';
import { Badge, BADGE_STYLES } from '@/components/ui/badge';
import { SearchWell } from '@/components/ui/search-well';
import { FilterWell } from '@/components/ui/filter-well';
import { Button } from '@/components/ui/button';
import { ExportVocButton } from '@/components/insights/VocActions';

const TINT = { voc: "#2dd4bf", comp: "#f43f5e", jrn: "#3b82f6", system: "#94a3b8" } as const;

export default async function InsightsPage() {
  const token = getTokenServerSide()!;
  const data = await fetchInsights(token, { limit: 20 }).catch(() => ({ insights: [], total: 0 }));
  const latestInsight = data.insights[0];

  let parsedThemes: [string, number, number, string][] = [];
  if (latestInsight?.themes) {
    try {
      const t = typeof latestInsight.themes === 'string' ? JSON.parse(latestInsight.themes) : latestInsight.themes;
      if (Array.isArray(t)) {
        parsedThemes = t.map((item: any) => [
          item.theme || item.name || "Unknown",
          item.count || 0,
          Math.min(100, (item.count || 0) * 2),
          item.churn_signal_rate > 0.2 ? "high" : "med"
        ]);
      } else {
        parsedThemes = Object.entries(t).map(([name, count]) => [
          name, 
          count as number, 
          Math.min(100, (count as number) * 2), 
          "med"
        ]);
      }
    } catch {
      // ignore
    }
  }

  const UB: Record<string, [string, keyof typeof BADGE_STYLES]> = { high: ["High", "high"], med: ["Medium", "warning"], low: ["Low", "neutral"] };
  const SENT: Record<string, [string, keyof typeof BADGE_STYLES]> = { pos: ["Positive", "success"], neg: ["Negative", "critical"], neu: ["Neutral", "neutral"] };

  return (
    <div className="pb-12">
      <Header
        title="Voice of Customer"
        description="Sentiment, themes & churn signals · Acme SaaS Inc."
      />



      {/* AI Narrative */}
      <section className="mt-5 w-full rounded-xl bg-slate-800 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)] p-5 sm:p-6">
        <div className="mb-3 flex items-center gap-2 text-xs font-medium text-teal-400">✦ AI Executive Narrative</div>
        <p className="max-w-4xl text-sm leading-relaxed text-slate-300">
          {latestInsight?.narrative ? (
            <span className="text-white">{latestInsight.narrative}</span>
          ) : (
            <span className="text-slate-500 italic">No narrative generated yet. Waiting for enough feedback signals...</span>
          )}
        </p>
      </section>

      {/* Charts */}
      <div className="mt-5 grid grid-cols-1 gap-5 md:grid-cols-3">
        <section className="rounded-xl bg-slate-800 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)] p-5">
          <div className="mb-3 flex items-baseline justify-between gap-3">
            <h2 className="truncate text-sm font-semibold text-white">Sentiment trend</h2>
            <span className="shrink-0 text-xs text-slate-400">30d</span>
          </div>
          <div className="mb-1 flex items-baseline gap-2">
            <span className="text-2xl font-semibold tabular-nums text-white">+{latestInsight?.sentiment_score ?? "0.42"}</span>
            <span className="text-xs text-teal-400">▲ 0.08 vs prev</span>
          </div>
          <Sparkline points={[2, 3, 2, 4, 3, 5, 4, 6, 5, 7]} color={TINT.voc} height={72} />
        </section>

        <section className="rounded-xl bg-slate-800 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)] p-5">
          <div className="mb-3 flex items-baseline justify-between gap-3">
            <h2 className="truncate text-sm font-semibold text-white">Churn risk</h2>
            <span className="shrink-0 text-xs text-slate-400">Growth cohort</span>
          </div>
          <div className="relative">
            <Gauge value={latestInsight?.churn_risk ?? 0.18} color="#f59e0b" />
            <div className="pointer-events-none absolute inset-x-0 bottom-1 flex flex-col items-center">
              <span className="text-2xl font-semibold tabular-nums text-white">{Math.round((latestInsight?.churn_risk ?? 0.18) * 100)}%</span>
              <span className="text-xs text-slate-400">at-risk</span>
            </div>
          </div>
          <p className="mt-2 text-center text-xs text-slate-400">▲ 4 pts vs last week</p>
        </section>

        <section className="rounded-xl bg-slate-800 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)] p-5">
          <div className="mb-3 flex items-baseline justify-between gap-3">
            <h2 className="truncate text-sm font-semibold text-white">Sentiment mix</h2>
            <span className="shrink-0 text-xs text-slate-400">all sources</span>
          </div>
          <div className="flex items-center gap-4">
            <Donut segments={[{ v: 56, color: "#2dd4bf" }, { v: 26, color: "#f43f5e" }, { v: 18, color: "#64748b" }]} />
            <ul className="min-w-0 flex-1 space-y-1.5 text-sm">
              <li className="flex items-center justify-between gap-3"><span className="flex items-center gap-2 text-slate-300"><span className="size-2 rounded-full bg-teal-400"></span>Positive</span><span className="font-medium tabular-nums text-slate-200">56%</span></li>
              <li className="flex items-center justify-between gap-3"><span className="flex items-center gap-2 text-slate-300"><span className="size-2 rounded-full bg-rose-400"></span>Negative</span><span className="font-medium tabular-nums text-slate-200">26%</span></li>
              <li className="flex items-center justify-between gap-3"><span className="flex items-center gap-2 text-slate-300"><span className="size-2 rounded-full bg-slate-500"></span>Neutral</span><span className="font-medium tabular-nums text-slate-200">18%</span></li>
            </ul>
          </div>
        </section>
      </div>

      {/* Top themes */}
      <section className="mt-5 w-full rounded-xl bg-slate-800 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)] p-5">
        <div className="mb-4 flex items-baseline justify-between gap-3">
          <h2 className="truncate text-sm font-semibold text-white">Top themes</h2>
          <span className="shrink-0 text-xs text-slate-400">clustered · 30d</span>
        </div>
        {parsedThemes.length === 0 ? (
          <div className="py-6 text-center text-sm text-slate-400 border border-dashed border-white/10 rounded-lg mt-2">
            No themes detected yet.
          </div>
        ) : (
          <ul className="space-y-3 mt-4">
            {parsedThemes.map((t, i) => (
              <li key={i} className="flex items-center gap-4">
                <div className="flex w-40 min-w-0 shrink-0 items-center gap-2 sm:w-56">
                  <span className="truncate text-sm text-slate-200">{t[0]}</span>
                  <Badge variant={UB[t[3]]?.[1] || "neutral"} dot>{UB[t[3]]?.[0] || "Unknown"}</Badge>
                </div>
                <div className="h-2.5 min-w-0 flex-1 overflow-hidden rounded-full bg-slate-700/60">
                  <div className="h-full rounded-full bg-teal-500" style={{ width: `${t[2]}%` }}></div>
                </div>
                <span className="w-10 shrink-0 text-right text-sm tabular-nums text-slate-300">{t[1]}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Raw feedback sample */}
      <section className="mt-5 w-full rounded-xl bg-slate-800 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)] p-5">
        <div className="mb-4 flex items-baseline justify-between gap-3">
          <div className="min-w-0">
            <h2 className="truncate text-sm font-semibold text-white">Raw feedback sample</h2>
            <p className="truncate text-xs text-slate-400">processed in transit · not persisted</p>
          </div>
          <ExportVocButton />
        </div>
        <div className="py-6 text-center text-sm text-slate-400 border border-dashed border-white/10 rounded-lg mt-4">
          No raw feedback samples available.
        </div>
      </section>
    </div>
  );
}
