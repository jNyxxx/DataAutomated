'use client';

import { useState } from 'react';
import { Download, Loader2, AlertCircle } from 'lucide-react';

// Presigned URLs are short-lived (15 min) and minted server-side per click —
// the page never holds a live S3 link (objects are private, §14).
export default function ReportDownload({ reportId, token }: { reportId: string; token: string }) {
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle');

  async function download() {
    setStatus('loading');
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000'}/api/reports/${reportId}/download-url`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (!res.ok) throw new Error(`${res.status}`);
      const { url } = (await res.json()) as { url: string };
      window.open(url, '_blank', 'noopener');
      setStatus('idle');
    } catch {
      setStatus('error');
      setTimeout(() => setStatus('idle'), 4000);
    }
  }

  const icons = {
    idle:    <Download size={11} />,
    loading: <Loader2 size={11} className="animate-spin" />,
    error:   <AlertCircle size={11} />,
  };

  const labels = {
    idle:    'Download PDF',
    loading: 'Preparing…',
    error:   'Error — retry',
  };

  const styles: Record<string, React.CSSProperties> = {
    idle: {
      background: 'rgba(16,185,129,0.10)',
      color: '#34D399',
      border: '1px solid rgba(16,185,129,0.20)',
      cursor: 'pointer',
    },
    loading: {
      background: 'rgba(16,185,129,0.08)',
      color: '#34D399',
      border: '1px solid rgba(16,185,129,0.15)',
      cursor: 'wait',
    },
    error: {
      background: 'rgba(239,68,68,0.10)',
      color: '#F87171',
      border: '1px solid rgba(239,68,68,0.20)',
      cursor: 'pointer',
    },
  };

  return (
    <button
      onClick={download}
      disabled={status === 'loading'}
      className="inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-md transition-all duration-150"
      style={styles[status]}
    >
      {icons[status]}
      {labels[status]}
    </button>
  );
}
