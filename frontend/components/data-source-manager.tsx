'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Check, Clock, Zap, ChevronRight } from 'lucide-react';
import {
  SOURCE_LABELS, SOURCE_ICONS, SOURCE_DESCRIPTIONS,
  SOURCE_DATA_COLLECTED, SOURCE_SYNC_FREQ, BETA_TYPES,
} from '@/lib/sources';

interface Props {
  categories: Record<string, string[]>;
  /** Source types the client has already connected (any status). */
  connectedTypes?: string[];
}

type ConnectPhase = 'idle' | 'connecting' | 'done' | 'error';

export default function DataSourceManager({ categories, connectedTypes = [] }: Props) {
  const router = useRouter();
  const [connecting, setConnecting] = useState<Record<string, ConnectPhase>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const connectedSet = new Set(connectedTypes);

  async function handleConnect(sourceType: string) {
    if (connectedSet.has(sourceType)) return;
    setConnecting((prev) => ({ ...prev, [sourceType]: 'connecting' }));
    setErrors((prev) => { const n = { ...prev }; delete n[sourceType]; return n; });

    try {
      const res = await fetch('/api/backend/api/data-sources', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source_type: sourceType, credentials: {}, config: {} }),
      });
      if (!res.ok) {
        const data = await res.json() as { detail?: string };
        setErrors((prev) => ({ ...prev, [sourceType]: data.detail ?? 'Connection failed' }));
        setConnecting((prev) => ({ ...prev, [sourceType]: 'error' }));
        setTimeout(() => setConnecting((prev) => ({ ...prev, [sourceType]: 'idle' })), 3000);
        return;
      }
      setConnecting((prev) => ({ ...prev, [sourceType]: 'done' }));
      setTimeout(() => router.refresh(), 1200);
    } catch {
      setErrors((prev) => ({ ...prev, [sourceType]: 'Network error' }));
      setConnecting((prev) => ({ ...prev, [sourceType]: 'error' }));
      setTimeout(() => setConnecting((prev) => ({ ...prev, [sourceType]: 'idle' })), 3000);
    }
  }

  return (
    <div className="space-y-8">
      {Object.entries(categories).map(([category, types]) => {
        const available = types.filter((t) => !connectedSet.has(t));
        if (available.length === 0) return null;

        return (
          <div key={category}>
            {/* Category header */}
            <div className="flex items-center gap-2.5 mb-4">
              <div className="h-px flex-1" style={{ background: 'rgba(148,163,184,0.08)' }} />
              <span className="text-[11px] font-semibold uppercase tracking-widest px-2" style={{ color: '#334155' }}>
                {category}
              </span>
              <div className="h-px flex-1" style={{ background: 'rgba(148,163,184,0.08)' }} />
            </div>

            {/* Integration cards */}
            <div className="grid gap-3">
              {available.map((sourceType) => {
                const phase = connecting[sourceType] ?? 'idle';
                const isConnected = connectedSet.has(sourceType);
                const isBeta = BETA_TYPES.has(sourceType);
                const label = SOURCE_LABELS[sourceType] ?? sourceType;
                const icon = SOURCE_ICONS[sourceType] ?? '🔌';
                const description = SOURCE_DESCRIPTIONS[sourceType] ?? '';
                const dataCollected = SOURCE_DATA_COLLECTED[sourceType] ?? '';
                const syncFreq = SOURCE_SYNC_FREQ[sourceType] ?? '';

                return (
                  <div
                    key={sourceType}
                    className="group flex items-center gap-4 px-5 py-4 rounded-xl transition-colors duration-150"
                    style={{
                      background: '#131C30',
                      border: '1px solid rgba(148,163,184,0.09)',
                    }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = 'rgba(99,102,241,0.18)'; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = 'rgba(148,163,184,0.09)'; }}
                  >
                    {/* Icon */}
                    <div
                      className="w-10 h-10 rounded-xl flex items-center justify-center text-lg shrink-0"
                      style={{ background: 'rgba(99,102,241,0.07)', border: '1px solid rgba(99,102,241,0.12)' }}
                    >
                      {icon}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold" style={{ color: '#E2E8F0' }}>{label}</span>
                        {isBeta && (
                          <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded" style={{ background: 'rgba(245,158,11,0.08)', color: '#F59E0B', border: '1px solid rgba(245,158,11,0.18)' }}>
                            Beta
                          </span>
                        )}
                      </div>
                      <p className="text-xs mt-0.5 truncate" style={{ color: '#475569' }}>{description}</p>
                      <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                        {dataCollected && (
                          <span className="text-[11px]" style={{ color: '#334155' }}>{dataCollected}</span>
                        )}
                        {syncFreq && (
                          <span className="flex items-center gap-1 text-[11px]" style={{ color: '#334155' }}>
                            <Clock size={10} />
                            {syncFreq}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Action */}
                    <div className="shrink-0">
                      {isConnected ? (
                        <span className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg" style={{ background: 'rgba(16,185,129,0.08)', color: '#34D399', border: '1px solid rgba(16,185,129,0.18)' }}>
                          <Check size={12} /> Connected
                        </span>
                      ) : phase === 'connecting' ? (
                        <span className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg" style={{ color: '#818CF8', border: '1px solid rgba(99,102,241,0.18)' }}>
                          <svg className="animate-spin w-3 h-3" viewBox="0 0 24 24" fill="none">
                            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeOpacity="0.2" />
                            <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                          </svg>
                          Connecting…
                        </span>
                      ) : phase === 'done' ? (
                        <span className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg" style={{ background: 'rgba(16,185,129,0.10)', color: '#34D399', border: '1px solid rgba(16,185,129,0.20)' }}>
                          <Zap size={12} /> Added
                        </span>
                      ) : phase === 'error' ? (
                        <span className="text-xs px-3 py-1.5 rounded-lg" style={{ background: 'rgba(239,68,68,0.08)', color: '#F87171', border: '1px solid rgba(239,68,68,0.18)' }} title={errors[sourceType]}>
                          Failed
                        </span>
                      ) : (
                        <button
                          onClick={() => handleConnect(sourceType)}
                          className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg transition-all duration-150"
                          style={{ background: 'rgba(99,102,241,0.10)', color: '#818CF8', border: '1px solid rgba(99,102,241,0.20)' }}
                          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'rgba(99,102,241,0.18)'; }}
                          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'rgba(99,102,241,0.10)'; }}
                        >
                          <Plus size={12} /> Connect
                          <ChevronRight size={11} style={{ opacity: 0.6 }} />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
