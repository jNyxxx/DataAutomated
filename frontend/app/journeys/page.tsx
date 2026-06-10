import { cookies } from 'next/headers';
import Link from 'next/link';
import { fetchJourneys } from '@/lib/api';
import { GitBranch, ArrowRight } from 'lucide-react';

const frictionLabels: Record<string, string> = {
  ux_friction:  'UX Friction',
  messaging:    'Messaging',
  expectation:  'Expectation Gap',
};

function DropOffBar({ rate }: { rate: number }) {
  const pct   = Math.min(rate * 100, 100);
  const color = pct > 30 ? '#EF4444' : pct > 15 ? '#F59E0B' : '#06B6D4';
  return (
    <div className="flex items-center gap-2 shrink-0">
      <div className="w-20 h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(148,163,184,0.10)' }}>
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span
        className="text-sm font-bold tabular-nums"
        style={{ color, fontVariantNumeric: 'tabular-nums', minWidth: 44 }}
      >
        {pct.toFixed(1)}%
      </span>
    </div>
  );
}

export default async function JourneysPage() {
  const cookieStore = await cookies();
  const token       = cookieStore.get('token')!.value;
  const res         = await fetchJourneys(token).catch(() => null);
  const journeys    = res?.insights ?? [];

  return (
    <div className="p-6 space-y-6 max-w-4xl page-enter">
      {/* Header */}
      <div className="flex items-center gap-2.5 mb-1">
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center"
          style={{ background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.20)' }}
        >
          <GitBranch size={16} style={{ color: '#818CF8' }} />
        </div>
        <div>
          <h1 className="text-xl font-bold" style={{ color: '#F1F5F9' }}>Journey Intelligence</h1>
          <p className="text-sm" style={{ color: '#475569' }}>Funnel drop-off analysis with AI-generated playbooks</p>
        </div>
      </div>

      {journeys.length > 0 ? (
        <div className="space-y-2">
          {journeys.map((j, i) => (
            <Link
              key={j.id}
              href={`/journeys/${j.id}`}
              className="flex items-center gap-4 rounded-xl px-4 py-3.5 anim-item transition-all duration-150 hover:bg-[#1a2240]"
              style={{
                background: '#151E35',
                border: '1px solid rgba(148,163,184,0.09)',
                animationDelay: `${i * 50}ms`,
              }}
            >
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold" style={{ color: '#E2E8F0' }}>
                  {j.funnel_step ?? '—'}
                </div>
                {j.friction_cause && (
                  <div className="text-xs mt-0.5" style={{ color: '#475569' }}>
                    {frictionLabels[j.friction_cause] ?? j.friction_cause}
                  </div>
                )}
              </div>

              <div className="flex items-center gap-3 shrink-0">
                {j.drop_off_rate !== null && (
                  <DropOffBar rate={Number(j.drop_off_rate)} />
                )}
                <ArrowRight size={14} style={{ color: '#334155' }} />
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <div className="empty-state">
          <GitBranch size={32} className="mx-auto mb-3" style={{ color: '#334155' }} />
          <p className="text-sm font-medium mb-1" style={{ color: '#475569' }}>No journey data yet</p>
          <p className="text-xs" style={{ color: '#334155' }}>Journey intelligence appears once behavioral data is ingested.</p>
        </div>
      )}
    </div>
  );
}
