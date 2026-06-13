import { cookies } from 'next/headers';
import Link from 'next/link';
import type { Signal } from '@/lib/types';
import { fetchSignals } from '@/lib/api';
import UrgencyBadge from '@/components/urgency-badge';
import TriggerAnalysisButton from '@/components/trigger-analysis-button';
import { Zap, ArrowRight, AlertCircle } from 'lucide-react';

const PAGE_SIZE = 20;

interface PageProps {
  searchParams: Promise<{ page?: string }>;
}

export default async function SignalsPage({ searchParams }: PageProps) {
  const { page: pageStr } = await searchParams;
  const page   = Math.max(1, parseInt(pageStr ?? '1', 10) || 1);
  const offset = (page - 1) * PAGE_SIZE;

  const cookieStore = await cookies();
  const token       = cookieStore.get('token')?.value ?? '';
  let res: { signals: Signal[]; total: number } | null = null;
  let fetchError = false;
  try { res = await fetchSignals(token, PAGE_SIZE, offset); } catch { fetchError = true; }
  const signals = res?.signals ?? [];
  const total   = res?.total ?? 0;
  const hasPrev = page > 1;
  const hasNext = offset + signals.length < total;

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

      {fetchError ? (
        <div className="empty-state">
          <AlertCircle size={28} className="mx-auto mb-3" style={{ color: '#EF4444' }} />
          <p className="text-sm font-medium mb-1" style={{ color: '#475569' }}>Could not load signals</p>
          <p className="text-xs" style={{ color: '#334155' }}>Check your connection or sign in again.</p>
        </div>
      ) : signals.length > 0 ? (
        <>
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
                  {!s.is_read && (
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

          {(hasPrev || hasNext) && (
            <div className="flex items-center justify-between pt-2">
              {hasPrev ? (
                <Link
                  href={`/signals?page=${page - 1}`}
                  className="text-sm font-medium px-3 py-1.5 rounded-lg transition-colors"
                  style={{ color: '#6366F1', background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.16)' }}
                >
                  ← Previous
                </Link>
              ) : <span />}
              <span className="text-xs tabular-nums" style={{ color: '#475569' }}>
                {offset + 1}–{Math.min(offset + signals.length, total)} of {total}
              </span>
              {hasNext ? (
                <Link
                  href={`/signals?page=${page + 1}`}
                  className="text-sm font-medium px-3 py-1.5 rounded-lg transition-colors"
                  style={{ color: '#6366F1', background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.16)' }}
                >
                  Next →
                </Link>
              ) : <span />}
            </div>
          )}
        </>
      ) : (
        <div className="empty-state">
          <Zap size={32} className="mx-auto mb-3" style={{ color: '#334155' }} />
          <p className="text-sm font-medium mb-1" style={{ color: '#475569' }}>No signals detected yet</p>
          <p className="text-xs" style={{ color: '#334155' }}>Signals will appear here once the scraper runs.</p>
          <TriggerAnalysisButton agent="signals" />
        </div>
      )}
    </div>
  );
}
