import { cookies } from 'next/headers';
import Link from 'next/link';
import { fetchSignals } from '@/lib/api';
import UrgencyBadge from '@/components/urgency-badge';

export default async function SignalsPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get('token')!.value;
  const res = await fetchSignals(token).catch(() => null);
  const signals = res?.signals ?? [];

  return (
    <div className="p-6 space-y-4 max-w-4xl">
      <h1 className="text-xl font-semibold">Competitive Signals</h1>

      {signals.length > 0 ? (
        <div className="space-y-2">
          {signals.map((s) => (
            <Link
              key={s.id}
              href={`/signals/${s.id}`}
              className="flex items-center gap-3 bg-white border border-gray-200 rounded-lg px-4 py-3 hover:border-indigo-300 transition-colors"
            >
              <UrgencyBadge urgency={s.urgency} />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-gray-900 truncate">
                  {s.competitor_name ?? '—'} — {s.signal_type ?? '—'}
                </div>
                {s.signal_source && (
                  <div className="text-xs text-gray-400 truncate">{s.signal_source}</div>
                )}
              </div>
              <div className="text-xs text-gray-400 shrink-0">
                {s.detected_at?.slice(0, 10) ?? ''}
              </div>
              {s.is_read === 'false' && (
                <span className="w-2 h-2 rounded-full bg-indigo-500 shrink-0" title="Unread" />
              )}
            </Link>
          ))}
        </div>
      ) : (
        <div className="bg-white border border-dashed border-gray-300 rounded-xl p-10 text-center">
          <p className="text-gray-400 text-sm">No signals yet.</p>
        </div>
      )}
    </div>
  );
}
