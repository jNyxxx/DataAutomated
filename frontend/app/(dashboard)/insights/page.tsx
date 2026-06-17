import Link from 'next/link';
import { getTokenServerSide, getUserRoleFromToken } from '@/lib/auth';
import { fetchInsights, fetchFeedbackSamples, fetchClientInfo } from '@/lib/api';
import { Header } from '@/components/layout/Header';
import { Sparkline, Donut, Gauge } from '@/components/ui/charts';
import { Badge, BADGE_STYLES } from '@/components/ui/badge';
import { AnalyzeButton, ExportVocButton } from '@/components/insights/VocActions';

const TINT = { voc: "#2dd4bf" } as const;

export default async function InsightsPage() {
  const token = (await getTokenServerSide())!;
  const role = getUserRoleFromToken(token);
  const canTrigger = role !== 'viewer';
  const [data, samplesData, clientInfo] = await Promise.all([
    fetchInsights(token, { limit: 20 }).catch(() => ({ insights: [], total: 0 })),
    fetchFeedbackSamples(token, { limit: 10 }).catch(() => ({ samples: [] })),
    fetchClientInfo(token).catch(() => ({ name: "Your account", plan: "insight_starter", email: "" })),
  ]);
  const latestInsight = data.insights[0];
  const prevInsight = data.insights[1];

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

  // Compute sentiment mix from all loaded insights
  const positiveCount = data.insights.filter(i => i.sentiment_label === 'positive').length;
  const negativeCount = data.insights.filter(i => i.sentiment_label === 'negative').length;
  const neutralCount = data.insights.filter(i => i.sentiment_label === 'neutral' || i.sentiment_label === 'mixed').length;
  const sentimentTotal = Math.max(positiveCount + negativeCount + neutralCount, 1);
  const posPct = Math.round((positiveCount / sentimentTotal) * 100);
  const negPct = Math.round((negativeCount / sentimentTotal) * 100);
  const neuPct = 100 - posPct - negPct;

  // Sparkline from recent sentiment scores (oldest→newest)
  const sentimentSparkline = data.insights
    .map(i => i.sentiment_score ?? 0)
    .reverse();

  // Compute real deltas from last 2 insight rows
  const sentimentDelta = latestInsight?.sentiment_score != null && prevInsight?.sentiment_score != null
    ? (latestInsight.sentiment_score - prevInsight.sentiment_score)
    : null;
  const churnDelta = latestInsight?.churn_risk != null && prevInsight?.churn_risk != null
    ? Math.round((latestInsight.churn_risk - prevInsight.churn_risk) * 100)
    : null;

  const UB: Record<string, [string, keyof typeof BADGE_STYLES]> = { high: ["High", "high"], med: ["Medium", "warning"], low: ["Low", "neutral"] };

  return (
    <div className="pb-12">
      <Header
        title="Voice of Customer"
        description={`Sentiment, themes & churn signals · ${clientInfo.name}`}
        actions={<AnalyzeButton canTrigger={canTrigger} />}
      />

      {/* AI Narrative */}
      <section className="mt-5 w-full rounded-xl bg-slate-800 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)] p-5 sm:p-6">
        <div className="mb-3 flex items-center gap-2 text-xs font-medium text-teal-400">✦ AI Executive Narrative</div>
        {latestInsight?.narrative ? (
          <p className="max-w-4xl text-sm leading-relaxed text-white">{latestInsight.narrative}</p>
        ) : (
          <div className="flex flex-col items-start gap-3 rounded-lg border border-dashed border-white/10 p-5">
            <p className="text-sm text-slate-400">
              No narrative generated yet — connect a feedback source and run your first VoC analysis.
            </p>
            <div className="flex flex-wrap gap-2">
              <Link
                href="/settings"
                className="inline-flex h-8 items-center rounded-lg bg-slate-700 px-3 text-xs font-medium text-slate-200 hover:bg-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              >
                Connect a source
              </Link>
              <AnalyzeButton canTrigger={canTrigger} />
            </div>
          </div>
        )}
      </section>

      {/* Charts */}
      <div className="mt-5 grid grid-cols-1 gap-5 md:grid-cols-3">
        <section className="rounded-xl bg-slate-800 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)] p-5">
          <div className="mb-3 flex items-baseline justify-between gap-3">
            <h2 className="truncate text-sm font-semibold text-white">Sentiment trend</h2>
            <span className="shrink-0 text-xs text-slate-400">30d</span>
          </div>
          <div className="mb-1 flex items-baseline gap-2">
            <span className="text-2xl font-semibold tabular-nums text-white">{latestInsight?.sentiment_score ? `+${latestInsight.sentiment_score}` : "N/A"}</span>
            {sentimentDelta !== null && (
              <span className={`text-xs ${sentimentDelta >= 0 ? 'text-teal-400' : 'text-rose-400'}`}>
                {sentimentDelta >= 0 ? '▲' : '▼'} {Math.abs(sentimentDelta).toFixed(2)} vs prev
              </span>
            )}
          </div>
          <Sparkline points={sentimentSparkline} color={TINT.voc} height={72} />
        </section>

        <section className="rounded-xl bg-slate-800 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)] p-5">
          <div className="mb-3 flex items-baseline justify-between gap-3">
            <h2 className="truncate text-sm font-semibold text-white">Churn risk</h2>
            <span className="shrink-0 text-xs text-slate-400">Growth cohort</span>
          </div>
          <div className="relative">
            <Gauge value={latestInsight?.churn_risk ?? 0} color="#f59e0b" />
            <div className="pointer-events-none absolute inset-x-0 bottom-1 flex flex-col items-center">
              <span className="text-2xl font-semibold tabular-nums text-white">{latestInsight?.churn_risk !== undefined && latestInsight.churn_risk !== null ? Math.round(latestInsight.churn_risk * 100) : "N/A"}%</span>
              <span className="text-xs text-slate-400">at-risk</span>
            </div>
          </div>
          {churnDelta !== null && (
            <p className={`mt-2 text-center text-xs ${churnDelta >= 0 ? 'text-rose-400' : 'text-teal-400'}`}>
              {churnDelta >= 0 ? '▲' : '▼'} {Math.abs(churnDelta)} pts vs prev period
            </p>
          )}
        </section>

        <section className="rounded-xl bg-slate-800 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)] p-5">
          <div className="mb-3 flex items-baseline justify-between gap-3">
            <h2 className="truncate text-sm font-semibold text-white">Sentiment mix</h2>
            <span className="shrink-0 text-xs text-slate-400">all sources</span>
          </div>
          <div className="flex items-center gap-4">
            <Donut segments={[{ v: posPct, color: "#2dd4bf" }, { v: negPct, color: "#f43f5e" }, { v: neuPct, color: "#64748b" }]} />
            <ul className="min-w-0 flex-1 space-y-1.5 text-sm">
              <li className="flex items-center justify-between gap-3"><span className="flex items-center gap-2 text-slate-300"><span className="size-2 rounded-full bg-teal-400"></span>Positive</span><span className="font-medium tabular-nums text-slate-200">{posPct}%</span></li>
              <li className="flex items-center justify-between gap-3"><span className="flex items-center gap-2 text-slate-300"><span className="size-2 rounded-full bg-rose-400"></span>Negative</span><span className="font-medium tabular-nums text-slate-200">{negPct}%</span></li>
              <li className="flex items-center justify-between gap-3"><span className="flex items-center gap-2 text-slate-300"><span className="size-2 rounded-full bg-slate-500"></span>Neutral</span><span className="font-medium tabular-nums text-slate-200">{neuPct}%</span></li>
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
          <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-white/10 py-8 text-center mt-2">
            <p className="text-sm text-slate-400">No themes detected yet — themes appear after your first VoC analysis.</p>
            <Link
              href="/settings"
              className="inline-flex h-8 items-center rounded-lg bg-slate-700 px-3 text-xs font-medium text-slate-200 hover:bg-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            >
              Connect a feedback source
            </Link>
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
            <p className="truncate text-xs text-slate-400">most recent ingested · tenant-scoped</p>
          </div>
          <ExportVocButton />
        </div>
        {samplesData.samples.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-white/10 py-8 text-center mt-4">
            <p className="text-sm text-slate-400">No feedback ingested yet. Connect Zendesk, Intercom, or Typeform to start capturing customer signals.</p>
            <Link
              href="/settings"
              className="inline-flex h-8 items-center rounded-lg bg-slate-700 px-3 text-xs font-medium text-slate-200 hover:bg-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            >
              Connect a feedback source
            </Link>
          </div>
        ) : (
          <ul className="mt-2 divide-y divide-white/5">
            {samplesData.samples.map((s) => (
              <li key={s.id} className="py-3">
                <div className="flex items-center gap-2 mb-1">
                  <Badge variant="voc" dot>{s.source_type}</Badge>
                  <span className="text-xs text-slate-500">
                    {s.ingested_at ? new Date(s.ingested_at).toLocaleString() : "—"}
                  </span>
                </div>
                <p className="text-sm text-slate-300 line-clamp-3">{s.content}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
