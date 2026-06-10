'use client';

import { useState } from 'react';
import { CheckCircle, XCircle, CheckCheck } from 'lucide-react';

interface Props {
  token: string;
  categories: Record<string, string[]>;
  sourceLabels: Record<string, string>;
  /** Active source types this client has already connected — these buttons are disabled. */
  connectedTypes?: string[];
}

export default function DataSourceManager({ token, categories, sourceLabels, connectedTypes = [] }: Props) {
  const [sourceType, setSourceType] = useState('');
  const [status, setStatus]         = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [errorMsg, setErrorMsg]     = useState('');

  const connectedSet = new Set(connectedTypes);

  async function connect() {
    if (!sourceType) return;
    // Client-side guard — mirrors the backend 409 constraint.
    if (connectedSet.has(sourceType)) {
      setErrorMsg(`${sourceLabels[sourceType] ?? sourceType} is already connected.`);
      setStatus('error');
      return;
    }
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
        // Surface the backend 409 message directly — it is already user-friendly.
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
        Each source type can only be connected once.
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
                const isConnected = connectedSet.has(type);
                const isSelected  = sourceType === type;
                return (
                  <button
                    key={type}
                    onClick={() => {
                      if (!isConnected) setSourceType(type === sourceType ? '' : type);
                    }}
                    disabled={isConnected}
                    title={isConnected ? `${sourceLabels[type] ?? type} is already connected` : undefined}
                    className="px-3 py-1.5 rounded-lg text-sm transition-all duration-150 flex items-center gap-1.5"
                    style={
                      isConnected
                        ? {
                            background: 'rgba(16,185,129,0.07)',
                            border: '1px solid rgba(16,185,129,0.20)',
                            color: '#34D399',
                            cursor: 'not-allowed',
                            opacity: 0.75,
                          }
                        : isSelected
                        ? {
                            background: 'rgba(99,102,241,0.15)',
                            border: '1px solid rgba(99,102,241,0.45)',
                            color: '#A5B4FC',
                            boxShadow: '0 0 12px rgba(99,102,241,0.15)',
                            cursor: 'pointer',
                          }
                        : {
                            background: 'rgba(255,255,255,0.03)',
                            border: '1px solid rgba(148,163,184,0.11)',
                            color: '#94A3B8',
                            cursor: 'pointer',
                          }
                    }
                  >
                    {isConnected && <CheckCheck size={12} />}
                    {sourceLabels[type] ?? type}
                    {isConnected && (
                      <span
                        className="ml-1 text-[10px] font-semibold uppercase tracking-wide"
                        style={{ color: 'rgba(52,211,153,0.7)' }}
                      >
                        Connected
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Connect action */}
      {sourceType && !connectedSet.has(sourceType) && (
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
