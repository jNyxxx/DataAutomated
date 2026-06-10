import { cookies } from 'next/headers';
import Link from 'next/link';
import KpiCard from '@/components/kpi-card';
import UrgencyBadge from '@/components/urgency-badge';
import {
  fetchDashboardSummary,
  fetchLatestInsight,
  fetchSignals,
  fetchJourneys,
} from '@/lib/api';

function fmt(n: number | string | null, decimals = 2): string {
  if (n === null || n === undefined) return '—';
  return Number(n).toFixed(decimals);
}

export default async function DashboardPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get('token')!.value;

  const [summary, insightRes, signalsRes, journeysRes] = await Promise.all([
    fetchDashboardSummary(token).catch(() => null),
    fetchLatestInsight(token).catch(() => null),
    fetchSignals(token).catch(() => null),
    fetchJourneys(token).catch(() => null),
  ]);

  const churnRisk = summary?.churn_risk ?? null;
  const isChurnWarn = churnRisk !== null && churnRisk > 0.15;

  return (
    <div className="p-6 space-y-6 max-w-6xl">
      <h1 className="text-xl font-semibold text-gray-900">Dashboard</h1>

      {/* KPI Row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <KpiCard
          label="Sentiment Score"
          value={fmt(summary?.sentiment_score ?? null)}
          sub="Latest VoC analysis"
        />
        <KpiCard
          label="Churn Risk"
          value={fmt(churnRisk)}
          warn={isChurnWarn}
          sub={isChurnWarn ? 'Above threshold — review insights' : 'Within safe range'}
        />
        <KpiCard
          label="Unread Signals"
          value={summary?.unread_signals ?? '—'}
          sub="Competitive signals awaiting review"
        />
      </div>

      {/* Snapshot Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* VoC Snapshot */}
        <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-medium text-sm text-gray-700">Voice of Customer</h2>
            <Link href="/insights" className="text-xs text-indigo-600 hover:underline">View all</Link>
          </div>
          {insightRes?.insight ? (
            <>
              <div className="text-xs text-gray-500 space-y-1">
                <div>
                  Sentiment: <span className="font-medium text-gray-800">
                    {insightRes.insight.sentiment_label ?? '—'}
                  </span>
                  {' '}({fmt(insightRes.insight.sentiment_score)})
                </div>
                <div>
                  Churn risk: <span className={`font-medium ${
                    Number(insightRes.insight.churn_risk) > 0.15 ? 'text-yellow-700' : 'text-gray-800'
                  }`}>{fmt(insightRes.insight.churn_risk)}</span>
                </div>
              </div>
              {insightRes.insight.narrative && (
                <p className="text-xs text-gray-600 line-clamp-3">{insightRes.insight.narrative}</p>
              )}
            </>
          ) : (
            <p className="text-xs text-gray-400">No insights yet. Trigger an analysis to begin.</p>
          )}
        </div>

        {/* CompSig Snapshot */}
        <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-medium text-sm text-gray-700">Competitive Signals</h2>
            <Link href="/signals" className="text-xs text-indigo-600 hover:underline">View all</Link>
          </div>
          {signalsRes && signalsRes.signals.length > 0 ? (
            <ul className="space-y-2">
              {signalsRes.signals.slice(0, 3).map((s) => (
                <li key={s.id} className="flex items-center gap-2">
                  <UrgencyBadge urgency={s.urgency} />
                  <span className="text-xs text-gray-700 truncate">
                    {s.competitor_name ?? '—'} — {s.signal_type ?? '—'}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-gray-400">No signals yet.</p>
          )}
        </div>

        {/* Journey Snapshot */}
        <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-medium text-sm text-gray-700">Journey Intelligence</h2>
            <Link href="/journeys" className="text-xs text-indigo-600 hover:underline">View all</Link>
          </div>
          {journeysRes && journeysRes.insights.length > 0 ? (
            <ul className="space-y-2">
              {journeysRes.insights.slice(0, 3).map((j) => (
                <li key={j.id} className="text-xs text-gray-700">
                  <span className="font-medium">{j.funnel_step ?? '—'}</span>
                  {j.drop_off_rate !== null && (
                    <span className="text-gray-400 ml-1">
                      {(Number(j.drop_off_rate) * 100).toFixed(1)}% drop-off
                    </span>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-gray-400">No journey data yet.</p>
          )}
        </div>
      </div>
    </div>
  );
}
