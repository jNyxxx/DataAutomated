'use client';

import Link from 'next/link';
import { ArrowRight, TrendingUp } from 'lucide-react';
import type { Insight } from '@/lib/types';

interface Props {
  insight: Insight;
  sentimentStyle: { bg: string; color: string; border: string };
}

export default function InsightCard({ insight, sentimentStyle: s }: Props) {
  return (
    <Link
      href={`/insights/${insight.id}`}
      className="block rounded-xl p-6 anim-item"
      style={{
        background: '#151E35',
        border: '1px solid rgba(148,163,184,0.09)',
        transition: 'border-color 180ms ease, transform 180ms ease, box-shadow 180ms ease',
      }}
      onMouseEnter={(e) => {
        const el = e.currentTarget as HTMLElement;
        el.style.borderColor = 'rgba(99,102,241,0.28)';
        el.style.transform = 'translateY(-1px)';
        el.style.boxShadow = '0 8px 28px rgba(0,0,0,0.3), 0 0 16px rgba(99,102,241,0.08)';
      }}
      onMouseLeave={(e) => {
        const el = e.currentTarget as HTMLElement;
        el.style.borderColor = 'rgba(148,163,184,0.09)';
        el.style.transform = 'translateY(0)';
        el.style.boxShadow = 'none';
      }}
    >
      <div className="flex items-start justify-between gap-6">
        {/* Left */}
        <div className="space-y-3 flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className="text-xs font-medium px-2.5 py-0.5 rounded-md"
              style={{ background: s.bg, color: s.color, border: `1px solid ${s.border}` }}
            >
              {insight.sentiment_label ?? 'unknown'}
            </span>
            {Number(insight.churn_risk) > 0.15 && (
              <span
                className="text-xs font-medium px-2.5 py-0.5 rounded-md"
                style={{
                  background: 'rgba(245,158,11,0.10)',
                  color: '#FBBF24',
                  border: '1px solid rgba(245,158,11,0.22)',
                }}
              >
                Churn risk: {Number(insight.churn_risk).toFixed(2)}
              </span>
            )}
          </div>

          {insight.narrative && (
            <p className="text-sm leading-relaxed line-clamp-3" style={{ color: '#94A3B8' }}>
              {insight.narrative}
            </p>
          )}

          <div className="flex items-center gap-1.5 text-xs tabular-nums" style={{ color: '#334155' }}>
            <TrendingUp size={12} />
            {insight.period_start && insight.period_end
              ? `${insight.period_start.slice(0, 10)} → ${insight.period_end.slice(0, 10)}`
              : insight.created_at?.slice(0, 10)}
          </div>
        </div>

        {/* Right — Score */}
        <div className="text-right shrink-0 flex flex-col items-end gap-2">
          <div
            className="text-3xl font-bold tabular-nums"
            style={{ color: '#818CF8', fontVariantNumeric: 'tabular-nums' }}
          >
            {Number(insight.sentiment_score).toFixed(2)}
          </div>
          <div className="text-[11px] uppercase tracking-wide" style={{ color: '#334155' }}>sentiment</div>
          <ArrowRight size={16} className="mt-2" style={{ color: '#6366F1' }} />
        </div>
      </div>
    </Link>
  );
}
