'use client';

import { useState } from 'react';
import { FileBarChart2, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';

export default function ReportTrigger({ token }: { token: string }) {
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');

  async function trigger() {
    setStatus('loading');
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000'}/api/reports/generate`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ report_type: 'weekly_intelligence', period: 'last_7_days' }),
      });
      setStatus(res.ok ? 'done' : 'error');
    } catch {
      setStatus('error');
    }
    setTimeout(() => setStatus('idle'), 4000);
  }

  const icons = {
    idle:    <FileBarChart2 size={15} />,
    loading: <Loader2 size={15} className="animate-spin" />,
    done:    <CheckCircle size={15} />,
    error:   <AlertCircle size={15} />,
  };

  const labels = {
    idle:    'Generate Report',
    loading: 'Generating…',
    done:    'Queued!',
    error:   'Error — retry',
  };

  const styles: Record<string, React.CSSProperties> = {
    idle: {
      background: 'linear-gradient(135deg, #6366F1, #8B5CF6)',
      color: 'white',
      border: 'none',
    },
    loading: {
      background: 'rgba(99,102,241,0.15)',
      color: '#818CF8',
      border: '1px solid rgba(99,102,241,0.25)',
      cursor: 'not-allowed',
    },
    done: {
      background: 'rgba(16,185,129,0.12)',
      color: '#34D399',
      border: '1px solid rgba(16,185,129,0.25)',
    },
    error: {
      background: 'rgba(239,68,68,0.12)',
      color: '#F87171',
      border: '1px solid rgba(239,68,68,0.25)',
    },
  };

  return (
    <button
      id="report-trigger-btn"
      onClick={trigger}
      disabled={status === 'loading'}
      className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all duration-150"
      style={styles[status]}
      onMouseEnter={(e) => {
        if (status === 'idle') {
          (e.currentTarget as HTMLElement).style.opacity = '0.88';
          (e.currentTarget as HTMLElement).style.transform = 'translateY(-1px)';
          (e.currentTarget as HTMLElement).style.boxShadow = '0 4px 16px rgba(99,102,241,0.35)';
        }
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.opacity = '1';
        (e.currentTarget as HTMLElement).style.transform = 'translateY(0)';
        (e.currentTarget as HTMLElement).style.boxShadow = 'none';
      }}
    >
      {icons[status]}
      {labels[status]}
    </button>
  );
}
