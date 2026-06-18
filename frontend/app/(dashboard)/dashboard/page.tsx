import { Suspense } from 'react';
import Link from 'next/link';
import { ArrowRight, ArrowUpRight, Settings } from 'lucide-react';
import { getTokenServerSide } from '@/lib/auth';
import {
  fetchClientInfo,
  fetchDashboardSummary,
  fetchDataSources,
  fetchInsights,
  fetchJourneys,
  fetchSignalOverview,
  fetchSignals,
} from '@/lib/api';
import { Header } from '@/components/layout/Header';
import { DatePeriodPicker } from '@/components/ui/DatePeriodPicker';
import { LiveBadge } from '@/components/ui/LiveBadge';
import { Badge, BADGE_STYLES, DOT_STYLES } from '@/components/ui/badge';
import { FunnelChart, Sparkline, Velocity } from '@/components/ui/charts';
import { Button } from '@/components/ui/button';
const TINT = { voc: '#2dd4bf', comp: '#f43f5e', jrn: '#3b82f6', system: '#94a3b8' } as const;

type Props = { searchParams: Promise<{ [key: string]: string | string[] | undefined }> };

function formatSigned(value: number, digits = 2) {
  return `${value >= 0 ? '+' : '-'}${Math.abs(value).toFixed(digits)}`;
}

function topThemeFrom(rawThemes: unknown): string {
  if (!rawThemes) return 'N/A';
  try {
    const parsed = typeof rawThemes === 'string' ? JSON.parse(rawThemes) : rawThemes;
    if (Array.isArray(parsed)) {
      const ranked = parsed
        .map((item: any) => ({
          name: item?.theme || item?.name || 'Unknown',
          score: Number(item?.count ?? item?.score ?? 0),
        }))
        .filter((item) => item.name);
      if (ranked.length > 0) {
        ranked.sort((a, b) => b.score - a.score);
        return ranked[0].name;
      }
      return 'N/A';
    }
    if (parsed && typeof parsed === 'object') {
      const ranked = Object.entries(parsed as Record<string, unknown>)
        .map(([name, score]) => ({ name, score: Number(score ?? 0) }))
        .filter((item) => item.name);
      if (ranked.length > 0) {
        ranked.sort((a, b) => b.score - a.score);
        return ranked[0].name;
      }
    }
  } catch {
    return 'N/A';
  }
  return 'N/A';
}

function topCompetitorFrom(signals: { competitor_name: string }[]) {
  const counts = new Map<string, number>();
  for (const signal of signals) {
    if (!signal.competitor_name) continue;
    counts.set(signal.competitor_name, (counts.get(signal.competitor_name) ?? 0) + 1);
  }
  return counts.size > 0
    ? Array.from(counts.entries()).sort((a, b) => b[1] - a[1])[0][0]
    : 'N/A';
}

// Force dynamic to avoid caching stale data on the dashboard
export const dynamic = 'force-dynamic';

export default async function DashboardPage({ searchParams }: Props) {
  const resolvedSearchParams = await searchParams;
  const period = typeof resolvedSearchParams?.period === 'string' ? resolvedSearchParams.period : 'last_30_days';
  const token = (await getTokenServerSide())!;
  const [summary, sourcesRes, insightsRes, signalsRes, journeysRes, clientInfo, signalOverviewRes] = await Promise.all([
    fetchDashboardSummary(token, period).catch(() => null),
    fetchDataSources(token).catch(() => ({ sources: [] })),
    fetchInsights(token, { limit: 10 }).catch(() => ({ insights: [], total: 0 })),
    fetchSignals(token, { limit: 10 }).catch(() => ({ signals: [], total: 0 })),
    fetchJourneys(token, { limit: 10 }).catch(() => ({ insights: [], total: 0 })),
    fetchClientInfo(token).catch(() => ({ name: 'Your account', plan: 'insight_starter', email: '' })),
    fetchSignalOverview(token, period).catch(() => ({ period, signals_7d: 0, tracked_competitors: 0, velocity: [], competitors: [], latest_context: null })),
  ]);

  const latestInsight = insightsRes.insights[0];
  const prevInsight = insightsRes.insights[1];

  const formatDate = (dateString?: string | null) => 
    dateString ? new Date(dateString).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '';

  const vocSparkline = insightsRes.insights
    .map((insight) => ({ value: insight.sentiment_score ?? 0, label: formatDate(insight.created_at) }))
    .reverse();

  const churnSparkline = insightsRes.insights
    .map((insight) => ({ value: insight.churn_risk ?? 0, label: formatDate(insight.created_at) }))
    .reverse();

  // Use the full-range overview velocity (DB-aggregated) rather than grouping the 10-item list
  const signalVelocity = (signalOverviewRes.velocity ?? []).map((v) => ({ day: v.label, count: v.count }));

  const funnel = journeysRes.insights.slice(0, 6).map((journey) => ({
    l: journey.funnel_step ?? 'Step',
    pct: Math.max(5, Math.round((1 - (journey.drop_off_rate ?? 0)) * 100)),
    n: `${Math.round((journey.drop_off_rate ?? 0) * 100)}% drop`,
    crit: (journey.drop_off_rate ?? 0) > 0.4,
  }));
  const funnelSparkline = journeysRes.insights
    .map((journey) => ({ value: journey.drop_off_rate ?? 0, label: formatDate(journey.created_at) }))
    .reverse();
  const agentSparkline = (summary?.runs_hourly ?? []).map((val, i) => ({ value: val, label: `Hour ${i+1}` }));

  const sentimentDelta =
    summary?.sentiment_score != null && prevInsight?.sentiment_score != null
      ? summary.sentiment_score - prevInsight.sentiment_score
      : null;
  const churnDelta =
    summary?.churn_risk != null && prevInsight?.churn_risk != null
      ? Math.round((summary.churn_risk - prevInsight.churn_risk) * 100)
      : null;
  const criticalCount = summary?.critical_signals ?? 0;
  const topTheme = topThemeFrom(latestInsight?.themes);
  const topCompetitor = topCompetitorFrom(signalsRes.signals);

  const attention = insightsRes.insights
    .filter((insight) => (insight.churn_risk ?? 0) > 0.15)
    .slice(0, 5)
    .map((insight) => ({
      stream: 'voc',
      su: (insight.churn_risk ?? 0) > 0.25 ? 'critical' : 'high',
      title: insight.narrative ?? 'Elevated churn risk detected',
      meta: [`Churn: ${Math.round((insight.churn_risk ?? 0) * 100)}%`, insight.sentiment_label ?? ''],
    }));

  const sources = sourcesRes.sources.map((source) => [
    source.source_type,
    !source.is_active
      ? 'off'
      : source.connection_status === 'active'
        ? 'ok'
        : source.connection_status === 'pending_configuration'
          ? 'syncing'
          : 'error',
    source.last_synced_at ? new Date(source.last_synced_at).toLocaleString() : 'Never synced',
  ]);

  const kpis = [
    {
      label: 'VoC Sentiment',
      stream: 'voc',
      value: summary?.sentiment_score != null ? formatSigned(summary.sentiment_score) : 'N/A',
      delta: sentimentDelta != null ? `${formatSigned(sentimentDelta)} vs prev wk` : 'run VoC analysis',
      dir: 'up' as const,
      spark: vocSparkline,
    },
    {
      label: 'Churn Risk',
      stream: 'voc',
      value: summary?.churn_risk != null ? `${Math.round(summary.churn_risk * 100)}%` : 'N/A',
      delta:
        churnDelta != null
          ? `${churnDelta > 0 ? '+' : churnDelta < 0 ? '-' : ''}${Math.abs(churnDelta)} pts${churnDelta > 0 ? ' watch' : churnDelta < 0 ? ' improving' : ' stable'}`
          : 'run VoC analysis',
      dir: 'down' as const,
      spark: churnSparkline,
    },
    {
      label: 'New Signals (48h)',
      stream: 'comp',
      value: summary?.unread_signals?.toString() ?? '0',
      delta: criticalCount > 0 ? `${criticalCount} critical` : '0 critical',
      dir: 'down' as const,
      spark: signalVelocity.map((item) => ({ value: item.count, label: item.day })),
    },
    {
      label: 'Top Funnel Drop',
      stream: 'jrn',
      value: summary?.latest_drop_off_rate != null ? `${Math.round(summary.latest_drop_off_rate * 100)}%` : 'N/A',
      delta: summary?.latest_funnel_step ?? 'run journey analysis',
      dir: 'down' as const,
      spark: funnelSparkline,
    },
    {
      label: 'Agent Runs (24h)',
      stream: 'system',
      value: summary?.agent_runs_24h?.toString() ?? '0',
      delta: summary?.agent_runs_24h ? 'all healthy' : 'no runs yet',
      dir: 'up' as const,
      spark: agentSparkline,
    },
  ];

  const streamLabels: Record<string, string> = {
    voc: 'VoC',
    comp: 'Competitive',
    jrn: 'Journey',
    system: 'System',
  };
  const severityBadges: Record<string, [string, keyof typeof BADGE_STYLES]> = {
    critical: ['CRIT', 'critical'],
    high: ['HIGH', 'high'],
    med: ['MED', 'warning'],
    low: ['LOW', 'neutral'],
  };
  const runBadges: Record<string, [string, keyof typeof BADGE_STYLES]> = {
    ok: ['OK', 'success'],
    running: ['SYNCING', 'info'],
    error: ['ERROR', 'critical'],
  };
  const sourceBadges: Record<string, [string, keyof typeof BADGE_STYLES]> = {
    ok: ['OK', 'success'],
    syncing: ['SYNCING', 'info'],
    stale: ['STALE', 'warning'],
    error: ['ERROR', 'critical'],
    off: ['OFF', 'neutral'],
  };
  const agentLabels: Record<string, string> = {
    voc_agent: 'VoC Agent',
    comp_signal_agent: 'Competitive Agent',
    journey_agent: 'Journey Agent',
  };
  const runs = (summary?.recent_agent_runs ?? []).map((run) => [
    agentLabels[run.actor] ?? run.actor,
    'ok',
    run.created_at ? new Date(run.created_at).toLocaleString() : '-',
  ]);

  return (
    <div className="pb-12 fade-in-up">
      <Header
        title="Dashboard"
        description={`${clientInfo?.name ?? 'Your account'} - all data live`}
        actions={
          <div className="flex items-center gap-2">
            <LiveBadge />
            <Suspense fallback={null}><DatePeriodPicker /></Suspense>
          </div>
        }
      />

      {sourcesRes.sources.length === 0 && (
        <div className="mt-5 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-blue-500/20 bg-blue-500/10 px-5 py-4 fade-in-up" style={{ animationDelay: '0.1s' }}>
          <div>
            <p className="text-sm font-medium text-blue-300">Your account isn&apos;t set up yet</p>
            <p className="mt-0.5 text-xs text-blue-400/80">
              Connect a data source to start generating intelligence.
            </p>
          </div>
          <Button variant="primary" size="sm" asChild>
            <Link href="/onboarding">Complete setup →</Link>
          </Button>
        </div>
      )}

      <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5 fade-in-up" style={{ animationDelay: '0.1s' }}>
        {kpis.map((kpi) => (
          <section key={kpi.label} className="glass-card rounded-xl p-4">
            <div className="flex items-center gap-2">
              <span className={`size-2 shrink-0 rounded-full ${DOT_STYLES[kpi.stream as keyof typeof DOT_STYLES]}`} />
              <span className="truncate text-xs text-slate-400">{kpi.label}</span>
            </div>
            <div className="mt-2 text-2xl font-semibold tabular-nums text-white">{kpi.value}</div>
            <div className={`mt-0.5 truncate text-xs ${kpi.dir === 'up' ? 'text-emerald-400' : 'text-rose-400'}`}>
              {kpi.dir === 'up' ? '▲' : '▼'} {kpi.delta}
            </div>
            <div className="mt-3">
              <Sparkline data={kpi.spark} color={TINT[kpi.stream as keyof typeof TINT]} height={36} />
            </div>
          </section>
        ))}
      </div>

      <section className="mt-5 glass-card rounded-xl p-5 fade-in-up" style={{ animationDelay: '0.2s' }}>
        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="truncate text-sm font-semibold text-white">Needs attention</h2>
            <p className="truncate text-xs text-slate-400">Urgent items across all streams</p>
          </div>
          <Button variant="ghost" asChild>
            <Link href="/insights">
              View queue {attention.length > 0 ? `(${attention.length})` : ''} <ArrowRight className="ml-1 size-4" />
            </Link>
          </Button>
        </div>
        <ul className="space-y-2">
          {attention.length === 0 ? (
            <li className="py-6 text-center text-sm text-slate-400">No urgent items currently.</li>
          ) : (
            attention.map((item, index) => (
              <li key={`${item.title}-${index}`}>
                <Link
                  href="/insights"
                  className="flex w-full items-center gap-3 rounded-lg bg-slate-900/50 p-3 text-left transition-colors hover:bg-slate-900/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                >
                  <div className="flex shrink-0 items-center gap-2">
                    <Badge variant={item.stream as keyof typeof BADGE_STYLES} dot>{streamLabels[item.stream]}</Badge>
                    <Badge variant={severityBadges[item.su]?.[1] || 'neutral'} dot>{severityBadges[item.su]?.[0] || 'Unknown'}</Badge>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-100">{item.title}</p>
                    <p className="text-xs text-slate-400">{item.meta.join(' - ')}</p>
                  </div>
                  <ArrowRight className="size-4 shrink-0 text-slate-500" />
                </Link>
              </li>
            ))
          )}
        </ul>
      </section>

      <div className="mt-5 grid grid-cols-1 gap-4 xl:grid-cols-2 fade-in-up" style={{ animationDelay: '0.3s' }}>
        <section className="glass-card flex flex-col rounded-xl p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <Badge variant="voc" dot>Voice of Customer</Badge>
            <Link href="/insights" className="inline-flex items-center gap-1 rounded text-xs font-medium text-slate-400 hover:text-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">Open <ArrowUpRight className="size-3" /></Link>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-semibold tabular-nums text-white">
              {summary?.sentiment_score != null ? formatSigned(summary.sentiment_score) : 'N/A'}
            </span>
            <span className={`text-xs ${sentimentDelta == null ? 'text-slate-500' : sentimentDelta >= 0 ? 'text-teal-400' : 'text-rose-400'}`}>
              {sentimentDelta != null ? `${formatSigned(sentimentDelta)} vs prev wk` : 'Need more data'}
            </span>
            <span className="ml-auto truncate text-xs text-slate-400">Sentiment - 30d</span>
          </div>
          <div className="mt-3 flex-1">
            <Sparkline data={vocSparkline} color={TINT.voc} height={48} />
          </div>
          <p className="mt-3 truncate text-sm text-slate-400">Top theme: <span className="text-slate-200">{topTheme}</span></p>
        </section>

        <section className="glass-card flex flex-col rounded-xl p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <Badge variant="comp" dot>Competitive</Badge>
            <Link href="/signals" className="inline-flex items-center gap-1 rounded text-xs font-medium text-slate-400 hover:text-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">Open <ArrowUpRight className="size-3" /></Link>
          </div>
          <div className="flex items-center gap-4">
            <div>
              <div className="text-2xl font-semibold tabular-nums text-rose-400">{criticalCount}</div>
              <div className="truncate text-xs text-slate-400">critical open</div>
            </div>
            <div>
              <div className="text-2xl font-semibold tabular-nums text-white">{summary?.unread_signals?.toString() ?? '0'}</div>
              <div className="truncate text-xs text-slate-400">signals - 7d</div>
            </div>
          </div>
          <div className="mt-3 flex-1">
            <Velocity data={signalVelocity} color={TINT.comp} />
          </div>
          <p className="mt-3 truncate text-sm text-slate-400">Top competitor: <span className="text-slate-200">{topCompetitor}</span></p>
        </section>

        <section className="glass-card rounded-xl p-5 xl:col-span-2">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <Badge variant="jrn" dot>Journey Intelligence</Badge>
            <p className="truncate text-sm text-slate-400">
              Top funnel drop: <span className="font-medium text-slate-200">{summary?.latest_funnel_step || 'N/A'}</span>{' '}
              <span className="font-semibold text-rose-400">
                {summary?.latest_drop_off_rate != null ? `${Math.round(summary.latest_drop_off_rate * 100)}%` : 'N/A'}
              </span>
            </p>
            <Link href="/journeys" className="inline-flex items-center gap-1 rounded text-xs font-medium text-slate-400 hover:text-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">Open <ArrowUpRight className="size-3" /></Link>
          </div>
          <FunnelChart steps={funnel} />
        </section>
      </div>

      <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-2 fade-in-up" style={{ animationDelay: '0.4s' }}>
        <section className="glass-card rounded-xl p-5">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="truncate text-sm font-semibold text-white">Agent runs</h2>
            <span className="shrink-0 text-xs text-slate-400">last 24h</span>
          </div>
          <ul className="divide-y divide-white/5">
            {runs.length === 0 ? (
              <li className="flex flex-col items-center gap-3 py-8 text-center">
                <p className="text-sm text-slate-400">No agent runs yet.</p>
                <Button variant="ghost" size="sm" asChild>
                  <Link href="/insights">Run your first analysis</Link>
                </Button>
              </li>
            ) : (
              runs.map((run, index) => (
                <li key={`${run[0]}-${index}`} className="flex items-center gap-3 py-2.5 text-sm">
                  <span className="min-w-0 flex-1 truncate text-slate-200">{run[0]}</span>
                  <span className="shrink-0 text-xs text-slate-400">{run[2]}</span>
                  <Badge variant={runBadges[run[1]]?.[1] || 'neutral'} dot>{runBadges[run[1]]?.[0] || 'Unknown'}</Badge>
                </li>
              ))
            )}
          </ul>
        </section>

        <section className="glass-card rounded-xl p-5">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="truncate text-sm font-semibold text-white">Source health</h2>
            <Button variant="ghost" asChild>
              <Link href="/settings"><Settings className="mr-2 size-4" /> Manage</Link>
            </Button>
          </div>
          <ul className="divide-y divide-white/5">
            {sources.length === 0 ? (
              <li className="flex flex-col items-center gap-3 py-8 text-center">
                <p className="text-sm text-slate-400">No data sources connected yet.</p>
                <Button variant="primary" size="sm" asChild>
                  <Link href="/settings">Connect your first source</Link>
                </Button>
              </li>
            ) : (
              sources.map((source, index) => (
                <li key={`${source[0]}-${index}`} className="flex items-center gap-3 py-2.5 text-sm">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-slate-200">{source[0]}</p>
                    <p className="truncate text-xs text-slate-400">{source[2]}</p>
                  </div>
                  <Badge variant={sourceBadges[source[1]]?.[1] || 'neutral'} dot>{sourceBadges[source[1]]?.[0] || 'Unknown'}</Badge>
                </li>
              ))
            )}
          </ul>
        </section>
      </div>
    </div>
  );
}
