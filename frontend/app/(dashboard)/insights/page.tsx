import { getTokenServerSide } from '@/lib/auth';
import { fetchInsights } from '@/lib/api';
import { Header } from '@/components/layout/Header';
import { InsightCard } from '@/components/insights/InsightCard';

export default async function InsightsPage() {
  const token = getTokenServerSide()!;
  const data = await fetchInsights(token, { limit: 20 }).catch(() => ({
    insights: [],
    total: 0,
  }));

  return (
    <div>
      <Header
        title="VoC Insights"
        description="AI-analyzed customer feedback — sentiment trends, themes, and churn signals"
      />

      {data.insights.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-64 text-center gap-2">
          <p className="text-muted-foreground">No insights yet.</p>
          <p className="text-sm text-muted-foreground">
            Connect a data source in Settings, then trigger an analysis.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4">
          {data.insights.map((insight) => (
            <InsightCard key={insight.id} insight={insight} />
          ))}
        </div>
      )}
    </div>
  );
}
