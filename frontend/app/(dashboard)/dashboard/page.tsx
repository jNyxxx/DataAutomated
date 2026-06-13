import { cookies } from 'next/headers';
import Link from 'next/link';
import KpiCard from '@/components/kpi-card';
import UrgencyBadge from '@/components/urgency-badge';
import OnboardingChecklist from '@/components/onboarding-checklist';
import {
  fetchDashboardSummary,
  fetchLatestInsight,
  fetchSignals,
  fetchJourneys,
} from '@/lib/api';
import { MessageSquareText, Zap, GitBranch, ArrowRight } from 'lucide-react';

function fmt(n: number | string | null, decimals = 2): string {
  if (n === null || n === undefined) return '—';
  return Number(n).toFixed(decimals);
}

function SectionCard({
  title,
  href,
  icon: Icon,
  children,
}: {
  title: string;
  href: string;
  icon: React.ElementType;
  children: React.ReactNode;
}) {
  return (
    <div
      className="rounded-xl p-5 flex flex-col gap-3"
      style={{
        background: '#151E35',
        border: '1px solid rgba(148,163,184,0.09)',
      }}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div
            className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
            style={{ background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.18)' }}
          >
            <Icon size={14} style={{ color: '#818CF8' }} />
          </div>
          <h2 className="text-sm font-semibold" style={{ color: '#E2E8F0' }}>
            {title}
          </h2>
        </div>
        <Link
          href={href}
          className="flex items-center gap-1 text-xs font-medium transition-colors duration-150"
          style={{ color: '#6366F1' }}
        >
          View all <ArrowRight size={12} />
        </Link>
      </div>
      {children}
    </div>
  );
}

function EmptyCard({ message }: { message: string }) {
  return (
    <div
      className="rounded-lg px-4 py-5 text-center"
      style={{
        background: 'rgba(255,255,255,0.015)',
        border: '1px dashed rgba(148,163,184,0.14)',
      }}
    >
      <p className="text-xs" style={{ color: '#475569' }}>{message}</p>
    </div>
  );
}

export default async function DashboardPage() {
  const cookieStore = await cookies();
  const token       = cookieStore.get('token')?.value ?? '';

  const [summary, insightRes, signalsRes, journeysRes] = await Promise.all([
    fetchDashboardSummary(token).catch(() => null),
    fetchLatestInsight(token).catch(() => null),
    fetchSignals(token).catch(() => null),
    fetchJourneys(token).catch(() => null),
  ]);

  const churnRisk   = summary?.churn_risk ?? null;
  const isChurnWarn = churnRisk !== null && churnRisk > 0.15;

  const hasAnyData =
    insightRes?.insight != null ||
    (signalsRes?.signals?.length ?? 0) > 0 ||
    (journeysRes?.insights?.length ?? 0) > 0;

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  return (
    <div className="p-6 space-y-6 max-w-6xl page-enter">
      {/* ── Page Header ─────────────────────────────── */}
      <div>
        <p className="text-xs font-medium mb-1" style={{ color: '#475569' }}>
          {greeting}
        </p>
        <h1
          className="text-2xl font-bold"
          style={{
            background: 'linear-gradient(135deg, #F1F5F9 0%, #94A3B8 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
          }}
        >
          Overview
        </h1>
      </div>

      {/* ── KPI Row ─────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="anim-item">
          <KpiCard
            label="Sentiment Score"
            value={fmt(summary?.sentiment_score ?? null)}
            sub="Latest VoC analysis"
          />
        </div>
        <div className="anim-item">
          <KpiCard
            label="Churn Risk"
            value={fmt(churnRisk)}
            warn={isChurnWarn}
            sub={isChurnWarn ? 'Above threshold — review insights' : 'Within safe range'}
          />
        </div>
        <div className="anim-item">
          <KpiCard
            label="Unread Signals"
            value={summary?.unread_signals ?? '—'}
            sub="Competitive signals awaiting review"
          />
        </div>
      </div>

      {/* ── Snapshot Cards or Onboarding ────────────── */}
      {!hasAnyData ? (
        <OnboardingChecklist />
      ) : (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

        {/* VoC Snapshot */}
        <div className="anim-item">
          <SectionCard title="Voice of Customer" href="/insights" icon={MessageSquareText}>
            {insightRes?.insight ? (
              <div className="space-y-2.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <span
                    className="text-xs font-medium px-2 py-0.5 rounded-md"
                    style={{
                      background:
                        insightRes.insight.sentiment_label === 'positive' ? 'rgba(16,185,129,0.12)' :
                        insightRes.insight.sentiment_label === 'negative' ? 'rgba(239,68,68,0.12)' :
                        'rgba(245,158,11,0.12)',
                      color:
                        insightRes.insight.sentiment_label === 'positive' ? '#34D399' :
                        insightRes.insight.sentiment_label === 'negative' ? '#F87171' :
                        '#FBBF24',
                      border:
                        insightRes.insight.sentiment_label === 'positive' ? '1px solid rgba(16,185,129,0.22)' :
                        insightRes.insight.sentiment_label === 'negative' ? '1px solid rgba(239,68,68,0.22)' :
                        '1px solid rgba(245,158,11,0.22)',
                    }}
                  >
                    {insightRes.insight.sentiment_label ?? 'unknown'}
                  </span>
                  {Number(insightRes.insight.churn_risk) > 0.15 && (
                    <span
                      className="text-xs font-medium px-2 py-0.5 rounded-md"
                      style={{
                        background: 'rgba(245,158,11,0.12)',
                        color: '#FBBF24',
                        border: '1px solid rgba(245,158,11,0.22)',
                      }}
                    >
                      Churn risk: {Number(insightRes.insight.churn_risk).toFixed(2)}
                    </span>
                  )}
                </div>
                {insightRes.insight.narrative && (
                  <p className="text-xs leading-relaxed line-clamp-3" style={{ color: '#64748B' }}>
                    {insightRes.insight.narrative}
                  </p>
                )}
                <div className="text-xs tabular-nums" style={{ color: '#334155' }}>
                  Score:{' '}
                  <span style={{ color: '#818CF8', fontWeight: 600 }}>
                    {Number(insightRes.insight.sentiment_score).toFixed(2)}
                  </span>
                </div>
              </div>
            ) : (
              <EmptyCard message="No insights yet. Trigger a VoC analysis to begin." />
            )}
          </SectionCard>
        </div>

        {/* Signals Snapshot */}
        <div className="anim-item">
          <SectionCard title="Competitive Signals" href="/signals" icon={Zap}>
            {signalsRes && signalsRes.signals.length > 0 ? (
              <ul className="space-y-2">
                {signalsRes.signals.slice(0, 3).map((s) => (
                  <li key={s.id} className="flex items-center gap-2.5">
                    <UrgencyBadge urgency={s.urgency} />
                    <span className="text-xs truncate" style={{ color: '#94A3B8' }}>
                      {s.competitor_name ?? '—'}
                      <span style={{ color: '#475569' }}> — {s.signal_type ?? '—'}</span>
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyCard message="No signals yet." />
            )}
          </SectionCard>
        </div>

        {/* Journey Snapshot */}
        <div className="anim-item">
          <SectionCard title="Journey Intelligence" href="/journeys" icon={GitBranch}>
            {journeysRes && journeysRes.insights.length > 0 ? (
              <ul className="space-y-2.5">
                {journeysRes.insights.slice(0, 3).map((j) => (
                  <li key={j.id} className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium" style={{ color: '#94A3B8' }}>
                      {j.funnel_step ?? '—'}
                    </span>
                    {j.drop_off_rate !== null && (
                      <span
                        className="text-xs font-semibold tabular-nums shrink-0"
                        style={{
                          color: Number(j.drop_off_rate) > 0.3 ? '#F87171' :
                                 Number(j.drop_off_rate) > 0.15 ? '#FBBF24' : '#34D399',
                        }}
                      >
                        {(Number(j.drop_off_rate) * 100).toFixed(1)}% drop-off
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyCard message="No journey data yet." />
            )}
          </SectionCard>
        </div>
      </div>
      )}
    </div>
  );
}
