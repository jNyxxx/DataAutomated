import { cookies } from 'next/headers';
import Link from 'next/link';
import { fetchLatestInsight } from '@/lib/api';
import ThemesChart from '@/components/themes-chart';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function InsightDetailPage({ params }: PageProps) {
  const { id } = await params;
  const cookieStore = await cookies();
  const token = cookieStore.get('token')!.value;
  const res = await fetchLatestInsight(token).catch(() => null);
  const insight = res?.insight?.id === id ? res.insight : null;

  if (!insight) {
    return (
      <div className="p-6">
        <Link href="/insights" className="text-sm text-indigo-600 hover:underline">&larr; Insights</Link>
        <p className="mt-4 text-gray-500 text-sm">Insight not found.</p>
      </div>
    );
  }

  let themes: Array<{ name: string; count?: number }> = [];
  try {
    const parsed = JSON.parse(insight.themes ?? '{}') as Record<string, unknown>;
    if (Array.isArray(parsed)) {
      themes = parsed as Array<{ name: string }>;
    } else {
      themes = Object.entries(parsed).map(([name, count]) => ({
        name,
        count: typeof count === 'number' ? count : 1,
      }));
    }
  } catch {
    // themes stays empty
  }

  const themeData = themes.map((t) => ({ name: t.name, count: t.count ?? 1 }));

  return (
    <div className="p-6 space-y-6 max-w-3xl">
      <Link href="/insights" className="text-sm text-indigo-600 hover:underline">&larr; Insights</Link>

      <div className="flex items-center gap-3">
        <h1 className="text-xl font-semibold">VoC Insight</h1>
        <span className="text-xs text-gray-400 font-mono">{insight.id.slice(0, 8)}…</span>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Sentiment Score', value: Number(insight.sentiment_score).toFixed(2) },
          { label: 'Urgency Score', value: Number(insight.urgency_score).toFixed(2) },
          { label: 'Churn Risk', value: Number(insight.churn_risk).toFixed(2) },
        ].map(({ label, value }) => (
          <div key={label} className="bg-white border border-gray-200 rounded-lg p-4">
            <div className="text-xs text-gray-500 mb-1">{label}</div>
            <div className="text-2xl font-bold text-gray-900">{value}</div>
          </div>
        ))}
      </div>

      {/* Narrative */}
      {insight.narrative && (
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <h2 className="text-sm font-medium text-gray-700 mb-2">Narrative</h2>
          <p className="text-sm text-gray-700 leading-relaxed">{insight.narrative}</p>
        </div>
      )}

      <ThemesChart data={themeData} />

      {/* Period */}
      {(insight.period_start || insight.period_end) && (
        <div className="text-xs text-gray-400">
          Period: {insight.period_start?.slice(0, 10)} → {insight.period_end?.slice(0, 10)}
        </div>
      )}
    </div>
  );
}
