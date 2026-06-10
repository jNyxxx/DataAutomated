import { cookies } from 'next/headers';
import Link from 'next/link';
import { fetchSignals } from '@/lib/api';
import UrgencyBadge from '@/components/urgency-badge';
import { Zap, ArrowRight } from 'lucide-react';

export default async function SignalsPage() {
  const cookieStore = await cookies();
  const token       = cookieStore.get('token')!.value;
  const res         = await fetchSignals(token).catch(() => null);
  const signals     = res?.signals ?? [];

  return (
    <div className="p-6 space-y-6 max-w-4xl page-enter">
      {/* Header */}
      <div className="flex items-center gap-2.5 mb-1">
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center"
          style={{ background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.20)' }}
        >
          <Zap size={16} style={{ color: '#818CF8' }} />
        </div>
        <div>
          <h1 className="text-xl font-bold" style={{ color: '#F1F5F9' }}>Competitive Signals</h1>
          <p className="text-sm" style={{ color: '#475569' }}>Scraped, classified, and prioritized in real-time</p>
        </div>
      </div>

      {signals.length > 0 ? (
        <div className="space-y-2">
          {signals.map((s, i) => (
            <Link
              key={s.id}
              href={`/signals/${s.id}`}
              className="flex items-center gap-4 rounded-xl px-4 py-3.5 anim-item transition-all duration-150 hover:bg-[#1a2240]"
              style={{
                background: '#151E35',
                border: '1px solid rgba(148,163,184,0.09)',
                animationDelay: `${i * 50}ms`,
              }}
            >
              <UrgencyBadge urgency={s.urgency} />

              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate" style={{ color: '#E2E8F0' }}>
                  {s.competitor_name ?? '—'}{' '}
                  <span style={{ color: '#64748B' }}>— {s.signal_type ?? '—'}</span>
                </div>
                {s.signal_source && (
                  <div className="text-xs truncate mt-0.5" style={{ color: '#334155' }}>
                    {s.signal_source}
                  </div>
                )}
              </div>

              <div className="flex items-center gap-3 shrink-0">
                <span className="text-xs tabular-nums" style={{ color: '#475569' }}>
                  {s.detected_at?.slice(0, 10) ?? ''}
                </span>
                {s.is_read === 'false' && (
                  <span
                    className="w-2 h-2 rounded-full"
                    style={{ background: '#6366F1', boxShadow: '0 0 6px rgba(99,102,241,0.6)' }}
                    title="Unread"
                  />
                )}
                <ArrowRight size={14} style={{ color: '#334155' }} />
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <div className="empty-state">
          <Zap size={32} className="mx-auto mb-3" style={{ color: '#334155' }} />
          <p className="text-sm font-medium mb-1" style={{ color: '#475569' }}>No signals detected yet</p>
          <p className="text-xs" style={{ color: '#334155' }}>Signals will appear here once the scraper runs.</p>
        </div>
      )}
    </div>
  );
}
