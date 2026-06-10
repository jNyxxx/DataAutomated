import { cookies } from 'next/headers';
import Link from 'next/link';
import { fetchJourneys } from '@/lib/api';

const frictionLabels: Record<string, string> = {
  ux_friction: 'UX Friction',
  messaging: 'Messaging',
  expectation: 'Expectation',
};

export default async function JourneysPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get('token')!.value;
  const res = await fetchJourneys(token).catch(() => null);
  const journeys = res?.insights ?? [];

  return (
    <div className="p-6 space-y-4 max-w-4xl">
      <h1 className="text-xl font-semibold">Journey Intelligence</h1>

      {journeys.length > 0 ? (
        <div className="space-y-2">
          {journeys.map((j) => (
            <Link
              key={j.id}
              href={`/journeys/${j.id}`}
              className="flex items-center gap-3 bg-white border border-gray-200 rounded-lg px-4 py-3 hover:border-indigo-300 transition-colors"
            >
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-gray-900">
                  {j.funnel_step ?? '—'}
                </div>
                {j.friction_cause && (
                  <div className="text-xs text-gray-400">
                    {frictionLabels[j.friction_cause] ?? j.friction_cause}
                  </div>
                )}
              </div>
              <div className="text-right shrink-0">
                <div className="text-lg font-bold text-gray-900">
                  {j.drop_off_rate !== null
                    ? `${(Number(j.drop_off_rate) * 100).toFixed(1)}%`
                    : '—'}
                </div>
                <div className="text-xs text-gray-400">drop-off</div>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <div className="bg-white border border-dashed border-gray-300 rounded-xl p-10 text-center">
          <p className="text-gray-400 text-sm">No journey data yet.</p>
        </div>
      )}
    </div>
  );
}
