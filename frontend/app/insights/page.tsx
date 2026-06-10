import { cookies } from 'next/headers';
import { fetchLatestInsight } from '@/lib/api';
import { MessageSquareText } from 'lucide-react';
import InsightCard from './insight-card';

function sentimentStyle(label: string | null): { bg: string; color: string; border: string } {
  switch (label) {
    case 'positive': return { bg: 'rgba(16,185,129,0.10)', color: '#34D399', border: 'rgba(16,185,129,0.22)' };
    case 'negative': return { bg: 'rgba(239,68,68,0.10)',  color: '#F87171', border: 'rgba(239,68,68,0.22)' };
    case 'mixed':    return { bg: 'rgba(245,158,11,0.10)', color: '#FBBF24', border: 'rgba(245,158,11,0.22)' };
    default:         return { bg: 'rgba(100,116,139,0.10)',color: '#94A3B8', border: 'rgba(100,116,139,0.18)' };
  }
}

export default async function InsightsPage() {
  const cookieStore = await cookies();
  const token       = cookieStore.get('token')!.value;
  const res         = await fetchLatestInsight(token).catch(() => null);
  const insight     = res?.insight ?? null;

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
      </div>

      {/* Insight card — client component for hover effects */}
      {insight ? (
        <InsightCard insight={insight} sentimentStyle={sentimentStyle(insight.sentiment_label)} />
      ) : (
        <div className="empty-state">
          <MessageSquareText size={32} className="mx-auto mb-3" style={{ color: '#334155' }} />
          <p className="text-sm font-medium mb-1" style={{ color: '#475569' }}>No insights yet</p>
          <p className="text-xs" style={{ color: '#334155' }}>Trigger a VoC analysis from the API to begin.</p>
        </div>
      )}
    </div>
  );
}
