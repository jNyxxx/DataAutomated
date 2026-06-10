'use client';

import { useState } from 'react';
import { CheckCircle, XCircle } from 'lucide-react';

interface Props {
  token: string;
  categories: Record<string, string[]>;
  sourceLabels: Record<string, string>;
}

export default function DataSourceManager({ token, categories, sourceLabels }: Props) {
  const [sourceType, setSourceType] = useState('');
  const [status, setStatus]         = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [errorMsg, setErrorMsg]     = useState('');

  async function connect() {
    if (!sourceType) return;
    setStatus('loading');
    setErrorMsg('');
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000'}/api/data-sources`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ source_type: sourceType, credentials: {}, config: {} }),
      });
      if (!res.ok) {
        const data = await res.json() as { detail?: string };
        setErrorMsg(data.detail ?? 'Connection failed');
        setStatus('error');
        return;
      }
      setStatus('done');
      setSourceType('');
      setTimeout(() => { setStatus('idle'); window.location.reload(); }, 1500);
    } catch {
      setStatus('error');
      setErrorMsg('Network error — check your connection');
    }
  }

  return (
    <div
      className="rounded-xl p-5 space-y-5"
      style={{
        background: '#151E35',
        border: '1px solid rgba(148,163,184,0.09)',
      }}
    >
      <p className="text-xs" style={{ color: '#64748B' }}>
        Select an integration type to connect. You will configure credentials after the initial connection.
      </p>

      {/* Category groups */}
      <div className="space-y-4">
        {Object.entries(categories).map(([category, types]) => (
          <div key={category}>
            <div
              className="text-[10px] font-semibold uppercase tracking-widest mb-2"
              style={{ color: '#334155' }}
            >
              {category}
            </div>
            <div className="flex flex-wrap gap-2">
              {types.map((type) => {
                const isSelected = sourceType === type;
                return (
                  <button
                    key={type}
                    onClick={() => setSourceType(type === sourceType ? '' : type)}
                    className="px-3 py-1.5 rounded-lg text-sm transition-all duration-150"
                    style={{
                      background: isSelected ? 'rgba(99,102,241,0.15)' : 'rgba(255,255,255,0.03)',
                      border: isSelected
                        ? '1px solid rgba(99,102,241,0.45)'
                        : '1px solid rgba(148,163,184,0.11)',
                      color: isSelected ? '#A5B4FC' : '#94A3B8',
                      boxShadow: isSelected ? '0 0 12px rgba(99,102,241,0.15)' : 'none',
                    }}
                  >
                    {sourceLabels[type] ?? type}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Connect action */}
      {sourceType && (
        <div
          className="pt-4 flex items-center gap-3"
          style={{ borderTop: '1px solid rgba(148,163,184,0.08)' }}
        >
          <span className="text-sm" style={{ color: '#94A3B8' }}>
            Connect{' '}
            <span style={{ color: '#A5B4FC', fontWeight: 600 }}>
              {sourceLabels[sourceType] ?? sourceType}
            </span>
          </span>

          <button
            onClick={connect}
            disabled={status === 'loading'}
            className="px-4 py-1.5 rounded-lg text-sm font-semibold transition-all duration-150"
            style={
              status === 'done'
                ? { background: 'rgba(16,185,129,0.12)', color: '#34D399', border: '1px solid rgba(16,185,129,0.25)' }
                : status === 'error'
                ? { background: 'rgba(239,68,68,0.12)', color: '#F87171', border: '1px solid rgba(239,68,68,0.25)' }
                : {
                    background: 'linear-gradient(135deg, #6366F1, #8B5CF6)',
                    color: 'white',
                    border: 'none',
                    opacity: status === 'loading' ? 0.6 : 1,
                  }
            }
          >
            {status === 'loading'
              ? 'Connecting…'
              : status === 'done'
              ? '✓ Connected!'
              : 'Connect'}
          </button>

          {status === 'done' && (
            <CheckCircle size={16} style={{ color: '#10B981' }} />
          )}
          {status === 'error' && (
            <span className="flex items-center gap-1.5 text-xs" style={{ color: '#F87171' }}>
              <XCircle size={14} />
              {errorMsg}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
