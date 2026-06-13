import { cookies } from 'next/headers';
import Link from 'next/link';
import type { Insight } from '@/lib/types';
import { fetchInsightsList } from '@/lib/api';
import { MessageSquareText, ArrowRight, AlertCircle } from 'lucide-react';
import InsightCard from './insight-card';
import TriggerAnalysisButton from '@/components/trigger-analysis-button';

function sentimentStyle(label: string | null): { bg: string; color: string; border: string } {
  switch (label) {
    case 'positive': return { bg: 'rgba(16,185,129,0.10)', color: '#34D399', border: 'rgba(16,185,129,0.22)' };
    case 'negative': return { bg: 'rgba(239,68,68,0.10)',  color: '#F87171', border: 'rgba(239,68,68,0.22)' };
    case 'mixed':    return { bg: 'rgba(245,158,11,0.10)', color: '#FBBF24', border: 'rgba(245,158,11,0.22)' };
    default:         return { bg: 'rgba(100,116,139,0.10)',color: '#94A3B8', border: 'rgba(100,116,139,0.18)' };
  }
}

function sentimentLabel(label: string | null, score: string | null): string {
  const s = Number(score ?? 0);
  if (label) return label.charAt(0).toUpperCase() + label.slice(1);
  if (s >= 0.3) return 'Positive';
  if (s <= -0.3) return 'Negative';
  return 'Neutral';
}

export default async function InsightsPage() {
  const cookieStore = await cookies();
  const token       = cookieStore.get('token')?.value ?? '';
  let res: { insights: Insight[]; total: number } | null = null;
  let fetchError = false;
  try { res = await fetchInsightsList(token, 20, 0); } catch { fetchError = true; }
  const insights = res?.insights ?? [];
  const latest   = insights[0] ?? null;

  return (
    <div className="p-6 space-y-6 max-w-4xl page-enter">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2.5 mb-1">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center"
              style={{ background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.20)' }}
            >
              <MessageSquareText size={16} style={{ color: '#818CF8' }} />
            </div>
            <h1 className="text-xl font-bold" style={{ color: '#F1F5F9' }}>
              VoC Insights
            </h1>
          </div>
          <p className="text-sm ml-10" style={{ color: '#475569' }}>
            Voice-of-Customer analysis synthesized by AI
          </p>
        </div>
        {insights.length > 0 && (
          <span className="text-xs tabular-nums" style={{ color: '#475569' }}>
            {res?.total ?? insights.length} total
          </span>
        )}
      </div>

      {fetchError ? (
        <div className="empty-state">
          <AlertCircle size={28} className="mx-auto mb-3" style={{ color: '#EF4444' }} />
          <p className="text-sm font-medium mb-1" style={{ color: '#475569' }}>Could not load insights</p>
          <p className="text-xs" style={{ color: '#334155' }}>Check your connection or sign in again.</p>
        </div>
      ) : insights.length > 0 ? (
        <div className="space-y-4">
          {/* Latest insight — full card */}
          {latest && (
            <InsightCard insight={latest} sentimentStyle={sentimentStyle(latest.sentiment_label)} />
          )}

          {/* History list — older entries */}
          {insights.length > 1 && (
            <div className="space-y-2">
              <div className="text-xs font-semibold uppercase tracking-widest mb-2" style={{ color: '#334155' }}>
                History
              </div>
              {insights.slice(1).map((ins, i) => (
                <Link
                  key={ins.id}
                  href={`/insights/${ins.id}`}
                  className="flex items-center gap-4 rounded-xl px-4 py-3.5 anim-item transition-all duration-150 hover:bg-[#1a2240]"
                  style={{
                    background: '#151E35',
                    border: '1px solid rgba(148,163,184,0.09)',
                    animationDelay: `${i * 50}ms`,
                  }}
                >
                  <div
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ background: sentimentStyle(ins.sentiment_label).color }}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate" style={{ color: '#E2E8F0' }}>
                      {ins.narrative
                        ? ins.narrative.slice(0, 80) + (ins.narrative.length > 80 ? '…' : '')
                        : `Insight ${ins.id.slice(0, 8)}`}
                    </div>
                    <div className="text-xs mt-0.5" style={{ color: '#475569' }}>
                      {sentimentLabel(ins.sentiment_label, ins.sentiment_score)} ·{' '}
                      Churn {(Number(ins.churn_risk ?? 0) * 100).toFixed(0)}% ·{' '}
                      {ins.created_at?.slice(0, 10)}
                    </div>
                  </div>
                  <ArrowRight size={14} style={{ color: '#334155' }} />
                </Link>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="empty-state">
          <MessageSquareText size={32} className="mx-auto mb-3" style={{ color: '#334155' }} />
          <p className="text-sm font-medium mb-1" style={{ color: '#475569' }}>No insights yet</p>
          <p className="text-xs" style={{ color: '#334155' }}>Connect a data source and trigger an analysis to begin.</p>
          <TriggerAnalysisButton agent="voc" />
        </div>
      )}
    </div>
  );
}
