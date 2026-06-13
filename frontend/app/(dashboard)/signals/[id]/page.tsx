import { cookies } from 'next/headers';
import Link from 'next/link';
import { fetchSignalById } from '@/lib/api';
import UrgencyBadge from '@/components/urgency-badge';
import MarkSignalRead from '@/components/mark-signal-read';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function SignalDetailPage({ params }: PageProps) {
  const { id } = await params;
  const cookieStore = await cookies();
  const token = cookieStore.get('token')?.value ?? '';
  const res = await fetchSignalById(token, id).catch(() => null);
  const signal = res?.signal ?? null;

  if (!signal) {
    return (
      <div className="p-6">
        <Link href="/signals" className="text-sm text-indigo-400 hover:underline">&larr; Signals</Link>
        <p className="mt-4 text-sm" style={{ color: '#475569' }}>Signal not found.</p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-5 max-w-3xl">
      <MarkSignalRead signalId={id} />
      <Link href="/signals" className="text-sm text-indigo-400 hover:underline">&larr; Signals</Link>

      <div className="flex items-center gap-3">
        <h1 className="text-xl font-semibold" style={{ color: '#F1F5F9' }}>
          {signal.competitor_name ?? '—'} — {signal.signal_type ?? '—'}
        </h1>
        <UrgencyBadge urgency={signal.urgency} />
      </div>

      <div className="grid grid-cols-2 gap-4">
        {[
          { label: 'Source', value: signal.signal_source },
          { label: 'Detected', value: signal.detected_at?.slice(0, 10) },
        ].map(({ label, value }) => (
          <div
            key={label}
            className="rounded-lg p-4"
            style={{ background: '#151E35', border: '1px solid rgba(148,163,184,0.09)' }}
          >
            <div className="text-xs mb-1" style={{ color: '#475569' }}>{label}</div>
            <div className="text-sm font-medium" style={{ color: '#E2E8F0' }}>{value ?? '—'}</div>
          </div>
        ))}
      </div>

      {signal.strategic_context && (
        <div
          className="rounded-xl p-5"
          style={{ background: '#151E35', border: '1px solid rgba(148,163,184,0.09)' }}
        >
          <h2 className="text-sm font-medium mb-2" style={{ color: '#94A3B8' }}>Strategic Context</h2>
          <p className="text-sm leading-relaxed" style={{ color: '#CBD5E1' }}>{signal.strategic_context}</p>
        </div>
      )}
    </div>
  );
}
