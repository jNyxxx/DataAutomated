import { getTokenServerSide } from '@/lib/auth';
import { fetchDashboardSummary } from '@/lib/api';
import { Header } from '@/components/layout/Header';
import { KPICard } from '@/components/dashboard/KPICard';
import { VoCSnapshotCard } from '@/components/dashboard/VoCSnapshotCard';
import { CompSignalCard } from '@/components/dashboard/CompSignalCard';
import { JourneySnapshotCard } from '@/components/dashboard/JourneySnapshotCard';

export default async function DashboardPage() {
  const token = getTokenServerSide()!;
  const summary = await fetchDashboardSummary(token).catch(() => null);

  return (
    <div>
      <Header
        title="Intelligence Dashboard"
        description="Real-time overview of your customer, competitive, and journey intelligence"
      />

      <div className="grid grid-cols-3 gap-4 mb-6">
        <KPICard
          label="Sentiment Score"
          value={summary?.sentiment_score ?? null}
          format="score"
        />
        <KPICard
          label="Churn Risk"
          value={summary?.churn_risk ?? null}
          format="risk"
          warning={(summary?.churn_risk ?? 0) > 0.15}
        />
        <KPICard
          label="Unread Signals"
          value={summary?.unread_signals ?? null}
          format="count"
        />
      </div>

      <div className="grid grid-cols-3 gap-4">
        <VoCSnapshotCard churnRisk={summary?.churn_risk ?? null} />
        <CompSignalCard unreadSignals={summary?.unread_signals ?? null} />
        <JourneySnapshotCard
          funnelStep={summary?.latest_funnel_step ?? null}
          dropOffRate={summary?.latest_drop_off_rate ?? null}
        />
      </div>
    </div>
  );
}
