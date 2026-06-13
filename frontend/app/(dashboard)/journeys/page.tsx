import { getTokenServerSide } from '@/lib/auth';
import { fetchJourneys } from '@/lib/api';
import { Header } from '@/components/layout/Header';
import { JourneyCard } from '@/components/journeys/JourneyCard';

export default async function JourneysPage() {
  const token = getTokenServerSide()!;
  const data = await fetchJourneys(token, { limit: 20 }).catch(() => ({
    insights: [],
    total: 0,
  }));

  return (
    <div>
      <Header
        title="Behavioral Journeys"
        description="Reconstructed user journeys — where users drop off and why"
      />

      {data.insights.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-64 text-center gap-2">
          <p className="text-muted-foreground">No journey data yet.</p>
          <p className="text-sm text-muted-foreground">
            Connect Mixpanel, Segment, or Shopify in Settings to start analyzing journeys.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4">
          {data.insights.map((insight) => (
            <JourneyCard key={insight.id} insight={insight} />
          ))}
        </div>
      )}
    </div>
  );
}
