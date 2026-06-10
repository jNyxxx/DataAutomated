import { cookies } from 'next/headers';
import Link from 'next/link';
import { fetchSignals } from '@/lib/api';
import UrgencyBadge from '@/components/urgency-badge';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function SignalDetailPage({ params }: PageProps) {
  const { id } = await params;
  const cookieStore = await cookies();
  const token = cookieStore.get('token')!.value;
  const res = await fetchSignals(token).catch(() => null);
  const signal = res?.signals.find((s) => s.id === id) ?? null;

  if (!signal) {
    return (
      <div className="p-6">
        <Link href="/signals" className="text-sm text-indigo-600 hover:underline">&larr; Signals</Link>
        <p className="mt-4 text-gray-500 text-sm">Signal not found.</p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-5 max-w-3xl">
      <Link href="/signals" className="text-sm text-indigo-600 hover:underline">&larr; Signals</Link>

      <div className="flex items-center gap-3">
        <h1 className="text-xl font-semibold">
          {signal.competitor_name ?? '—'} — {signal.signal_type ?? '—'}
        </h1>
        <UrgencyBadge urgency={signal.urgency} />
      </div>

      <div className="grid grid-cols-2 gap-4">
        {[
          { label: 'Source', value: signal.signal_source },
          { label: 'Detected', value: signal.detected_at?.slice(0, 10) },
        ].map(({ label, value }) => (
          <div key={label} className="bg-white border border-gray-200 rounded-lg p-4">
            <div className="text-xs text-gray-500 mb-1">{label}</div>
            <div className="text-sm font-medium text-gray-900">{value ?? '—'}</div>
          </div>
        ))}
      </div>

      {signal.strategic_context && (
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <h2 className="text-sm font-medium text-gray-700 mb-2">Strategic Context</h2>
          <p className="text-sm text-gray-700 leading-relaxed">{signal.strategic_context}</p>
        </div>
      )}
    </div>
  );
}
