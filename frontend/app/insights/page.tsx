import { cookies } from 'next/headers';
import Link from 'next/link';
import { fetchLatestInsight } from '@/lib/api';

function sentimentColor(label: string | null) {
  if (label === 'positive') return 'text-green-700 bg-green-50 border-green-200';
  if (label === 'negative') return 'text-red-700 bg-red-50 border-red-200';
  if (label === 'mixed') return 'text-yellow-700 bg-yellow-50 border-yellow-200';
  return 'text-gray-700 bg-gray-50 border-gray-200';
}

export default async function InsightsPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get('token')!.value;
  const res = await fetchLatestInsight(token).catch(() => null);
  const insight = res?.insight ?? null;

  return (
    <div className="p-6 space-y-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">VoC Insights</h1>
      </div>

      {insight ? (
        <Link
          href={`/insights/${insight.id}`}
          className="block bg-white border border-gray-200 rounded-xl p-5 hover:border-indigo-300 transition-colors"
        >
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-2 flex-1">
              <div className="flex items-center gap-2">
                <span
                  className={`text-xs font-medium px-2 py-0.5 rounded border ${sentimentColor(
                    insight.sentiment_label,
                  )}`}
                >
                  {insight.sentiment_label ?? 'unknown'}
                </span>
                {Number(insight.churn_risk) > 0.15 && (
                  <span className="text-xs font-medium px-2 py-0.5 rounded border text-yellow-700 bg-yellow-50 border-yellow-200">
                    Churn risk: {Number(insight.churn_risk).toFixed(2)}
                  </span>
                )}
              </div>
              {insight.narrative && (
                <p className="text-sm text-gray-700 line-clamp-3">{insight.narrative}</p>
              )}
              <div className="text-xs text-gray-400">
                {insight.period_start && insight.period_end
                  ? `${insight.period_start.slice(0, 10)} → ${insight.period_end.slice(0, 10)}`
                  : insight.created_at?.slice(0, 10)}
              </div>
            </div>
            <div className="text-right shrink-0">
              <div className="text-2xl font-bold text-gray-900">
                {Number(insight.sentiment_score).toFixed(2)}
              </div>
              <div className="text-xs text-gray-400">sentiment</div>
            </div>
          </div>
        </Link>
      ) : (
        <div className="bg-white border border-dashed border-gray-300 rounded-xl p-10 text-center">
          <p className="text-gray-400 text-sm">No insights yet.</p>
          <p className="text-gray-400 text-xs mt-1">Trigger a VoC analysis from the API to begin.</p>
        </div>
      )}
    </div>
  );
}
