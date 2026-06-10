'use client';

import { useState } from 'react';

export default function ReportTrigger({ token }: { token: string }) {
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');

  async function trigger() {
    setStatus('loading');
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/reports/generate`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
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

  return (
    <button
      onClick={trigger}
      disabled={status === 'loading'}
      className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
        status === 'done'
          ? 'bg-green-100 text-green-700'
          : status === 'error'
          ? 'bg-red-100 text-red-700'
          : 'bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-60'
      }`}
    >
      {status === 'loading' ? 'Generating…' : status === 'done' ? 'Queued!' : status === 'error' ? 'Error — retry' : 'Generate Report'}
    </button>
  );
}
