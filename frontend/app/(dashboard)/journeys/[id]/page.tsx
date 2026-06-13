import { cookies } from 'next/headers';
import Link from 'next/link';
import { fetchJourneys } from '@/lib/api';
import FunnelChart from '@/components/funnel-chart';

interface PageProps {
  params: Promise<{ id: string }>;
}

const frictionLabels: Record<string, string> = {
  ux_friction: 'UX Friction',
  messaging: 'Messaging',
  expectation: 'Expectation Gap',
};

export default async function JourneyDetailPage({ params }: PageProps) {
  const { id } = await params;
  const cookieStore = await cookies();
  const token = cookieStore.get('token')?.value ?? '';
  const res = await fetchJourneys(token).catch(() => null);
  const journey = res?.insights.find((j) => j.id === id) ?? null;

  if (!journey) {
    return (
      <div className="p-6">
        <Link href="/journeys" className="text-sm text-indigo-400 hover:underline">&larr; Journeys</Link>
        <p className="mt-4 text-sm" style={{ color: '#475569' }}>Journey insight not found.</p>
      </div>
    );
  }

  const funnelData = res?.insights
    .filter((j) => j.drop_off_rate !== null)
    .map((j) => ({
      step: j.funnel_step ?? 'Unknown',
      dropOff: Number(j.drop_off_rate) * 100,
    })) ?? [];

  return (
    <div className="p-6 space-y-5 max-w-3xl">
      <Link href="/journeys" className="text-sm text-indigo-400 hover:underline">&larr; Journeys</Link>

      <h1 className="text-xl font-semibold" style={{ color: '#F1F5F9' }}>
        {journey.funnel_step ?? 'Journey Step'}
      </h1>

      <div className="grid grid-cols-3 gap-4">
        {[
          {
            label: 'Drop-off Rate',
            value: journey.drop_off_rate !== null
              ? `${(Number(journey.drop_off_rate) * 100).toFixed(1)}%`
              : '—',
          },
          {
            label: 'Friction Score',
            value: journey.friction_score !== null
              ? Number(journey.friction_score).toFixed(2)
              : '—',
          },
          {
            label: 'Projected Lift',
            value: journey.projected_lift !== null
              ? `${(Number(journey.projected_lift) * 100).toFixed(1)}%`
              : '—',
          },
        ].map(({ label, value }) => (
          <div
            key={label}
            className="rounded-lg p-4"
            style={{ background: '#151E35', border: '1px solid rgba(148,163,184,0.09)' }}
          >
            <div className="text-xs mb-1" style={{ color: '#475569' }}>{label}</div>
            <div className="text-2xl font-bold" style={{ color: '#F1F5F9' }}>{value}</div>
          </div>
        ))}
      </div>

      {journey.friction_cause && (
        <div
          className="rounded-lg px-4 py-3"
          style={{ background: '#151E35', border: '1px solid rgba(148,163,184,0.09)' }}
        >
          <span className="text-xs" style={{ color: '#475569' }}>Friction cause: </span>
          <span className="text-sm font-medium" style={{ color: '#E2E8F0' }}>
            {frictionLabels[journey.friction_cause] ?? journey.friction_cause}
          </span>
        </div>
      )}

      {journey.recommendation && (
        <div
          className="rounded-xl p-5"
          style={{ background: '#151E35', border: '1px solid rgba(148,163,184,0.09)' }}
        >
          <h2 className="text-sm font-medium mb-2" style={{ color: '#94A3B8' }}>Recommendation</h2>
          <p className="text-sm leading-relaxed" style={{ color: '#CBD5E1' }}>{journey.recommendation}</p>
        </div>
      )}

      <FunnelChart data={funnelData} />
    </div>
  );
}
