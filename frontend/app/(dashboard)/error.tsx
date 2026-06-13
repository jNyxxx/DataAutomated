'use client';

import { useEffect } from 'react';
import { AlertTriangle } from 'lucide-react';

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[DashboardError]', error);
  }, [error]);

  return (
    <div className="flex items-center justify-center min-h-[60vh] p-6">
      <div
        className="rounded-xl p-8 max-w-md w-full text-center space-y-4"
        style={{
          background: '#151E35',
          border: '1px solid rgba(239,68,68,0.20)',
        }}
      >
        <div
          className="w-12 h-12 rounded-full flex items-center justify-center mx-auto"
          style={{ background: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.20)' }}
        >
          <AlertTriangle size={22} style={{ color: '#F87171' }} />
        </div>

        <div className="space-y-1.5">
          <h2 className="text-base font-semibold" style={{ color: '#F1F5F9' }}>
            Something went wrong
          </h2>
          <p className="text-sm" style={{ color: '#64748B' }}>
            {error.message ?? 'An unexpected error occurred loading this page.'}
          </p>
        </div>

        <button
          onClick={reset}
          className="btn-gradient px-5 py-2 text-sm rounded-lg"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
