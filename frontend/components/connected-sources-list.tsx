'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  CheckCircle, AlertCircle, Clock, WifiOff, Settings2, Unplug,
  RefreshCw, ChevronRight, Zap,
} from 'lucide-react';
import CredentialEditor from './credential-editor';
import type { DataSource, ConnectionStatus } from '@/lib/sources';
import { SOURCE_LABELS, SOURCE_ICONS, BETA_TYPES } from '@/lib/sources';

interface Props {
  sources: DataSource[];
}

// ── Status metadata ──────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<ConnectionStatus, {
  label: string;
  badgeStyle: React.CSSProperties;
  dotStyle: React.CSSProperties;
  pulseDot?: boolean;
  icon: React.ReactNode;
}> = {
  active: {
    label: 'Active',
    badgeStyle: { background: 'rgba(16,185,129,0.10)', color: '#34D399', border: '1px solid rgba(16,185,129,0.20)' },
    dotStyle: { background: '#10B981', boxShadow: '0 0 8px rgba(16,185,129,0.5)' },
    icon: <CheckCircle size={12} />,
  },
  pending_configuration: {
    label: 'Pending Setup',
    badgeStyle: { background: 'rgba(245,158,11,0.10)', color: '#FBBF24', border: '1px solid rgba(245,158,11,0.22)' },
    dotStyle: { background: '#F59E0B' },
    pulseDot: true,
    icon: <Clock size={12} />,
  },
  testing: {
    label: 'Testing',
    badgeStyle: { background: 'rgba(99,102,241,0.10)', color: '#818CF8', border: '1px solid rgba(99,102,241,0.22)' },
    dotStyle: { background: '#6366F1' },
    pulseDot: true,
    icon: <RefreshCw size={12} className="animate-spin" />,
  },
  failed: {
    label: 'Failed',
    badgeStyle: { background: 'rgba(239,68,68,0.10)', color: '#F87171', border: '1px solid rgba(239,68,68,0.22)' },
    dotStyle: { background: '#EF4444' },
    icon: <WifiOff size={12} />,
  },
  disconnected: {
    label: 'Disconnected',
    badgeStyle: { background: 'rgba(100,116,139,0.10)', color: '#64748B', border: '1px solid rgba(100,116,139,0.18)' },
    dotStyle: { background: '#334155' },
    icon: <WifiOff size={12} />,
  },
};

type DisconnectPhase = 'idle' | 'confirm' | 'deleting';

export default function ConnectedSourcesList({ sources }: Props) {
  const router = useRouter();
  const [editingSource, setEditingSource] = useState<DataSource | null>(null);
  const [disconnectMap, setDisconnectMap] = useState<Record<string, DisconnectPhase>>({});

  // Auto-refresh every 5 s while any source is pending or testing (up to 2 min)
  const hasTransient = sources.some(
    (s) => s.connection_status === 'pending_configuration' || s.connection_status === 'testing'
  );
  useEffect(() => {
    if (!hasTransient) return;
    let ticks = 0;
    const id = setInterval(() => {
      ticks++;
      router.refresh();
      if (ticks >= 24) clearInterval(id);
    }, 5000);
    return () => clearInterval(id);
  }, [hasTransient, router]);

  function setDisconnect(id: string, phase: DisconnectPhase) {
    setDisconnectMap((prev) => ({ ...prev, [id]: phase }));
  }

  async function confirmDisconnect(s: DataSource) {
    setDisconnect(s.id, 'deleting');
    try {
      await fetch(`/api/backend/api/data-sources/${s.id}`, { method: 'DELETE' });
    } catch { /* network error — let server-state win on refresh */ }
    router.refresh();
    setDisconnect(s.id, 'idle');
  }

  if (sources.length === 0) return null;

  const activeCount = sources.filter((s) => s.connection_status === 'active').length;
  const pendingCount = sources.filter((s) => s.connection_status === 'pending_configuration' || s.connection_status === 'failed').length;

  return (
    <>
      <section className="space-y-3">
        {/* Section header */}
        <div className="flex items-center gap-3 mb-4">
          <Zap size={15} style={{ color: '#6366F1' }} />
          <h2 className="text-sm font-semibold uppercase tracking-widest" style={{ color: '#475569' }}>
            Connected Integrations
          </h2>
          <div className="flex items-center gap-2 ml-auto">
            {activeCount > 0 && (
              <span className="text-xs font-medium px-2 py-0.5 rounded-md" style={{ background: 'rgba(16,185,129,0.10)', color: '#34D399', border: '1px solid rgba(16,185,129,0.20)' }}>
                {activeCount} active
              </span>
            )}
            {pendingCount > 0 && (
              <span className="text-xs font-medium px-2 py-0.5 rounded-md" style={{ background: 'rgba(245,158,11,0.10)', color: '#FBBF24', border: '1px solid rgba(245,158,11,0.22)' }}>
                {pendingCount} need setup
              </span>
            )}
          </div>
        </div>

        {/* Source rows */}
        <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid rgba(148,163,184,0.09)' }}>
          {sources.map((s, i) => {
            const status = s.connection_status as ConnectionStatus;
            const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.pending_configuration;
            const dcPhase = disconnectMap[s.id] ?? 'idle';
            const label = SOURCE_LABELS[s.source_type] ?? s.source_type;
            const icon = SOURCE_ICONS[s.source_type] ?? '🔌';

            return (
              <div
                key={s.id}
                className="flex items-center gap-4 px-5 py-4 transition-colors duration-150 hover:bg-[#1a2240]"
                style={{
                  background: '#131C30',
                  borderBottom: i < sources.length - 1 ? '1px solid rgba(148,163,184,0.07)' : 'none',
                }}
              >
                {/* Status dot */}
                <span
                  className={`w-2 h-2 rounded-full shrink-0 ${cfg.pulseDot ? 'animate-pulse' : ''}`}
                  style={cfg.dotStyle}
                />

                {/* Icon + info */}
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <span className="text-base shrink-0">{icon}</span>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium" style={{ color: '#E2E8F0' }}>{label}</span>
                      {BETA_TYPES.has(s.source_type) && (
                        <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded" style={{ background: 'rgba(245,158,11,0.08)', color: '#F59E0B', border: '1px solid rgba(245,158,11,0.18)' }}>
                          Beta
                        </span>
                      )}
                    </div>

                    {/* Sub-line: contextual info per status */}
                    <div className="mt-0.5 text-xs" style={{ color: '#475569' }}>
                      {status === 'active' && s.last_synced_at && (
                        <span>Last synced {s.last_synced_at.slice(0, 10)}</span>
                      )}
                      {status === 'active' && !s.last_synced_at && (
                        <span>Active — first sync pending</span>
                      )}
                      {status === 'pending_configuration' && (
                        <span className="text-amber-500/80">Configure credentials to activate</span>
                      )}
                      {status === 'testing' && (
                        <span style={{ color: '#818CF8' }}>Validating connection…</span>
                      )}
                      {status === 'failed' && s.connection_error && (
                        <span className="text-red-400/80">{s.connection_error}</span>
                      )}
                      {status === 'failed' && !s.connection_error && (
                        <span className="text-red-400/80">Connection test failed</span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 shrink-0">
                  {dcPhase === 'confirm' ? (
                    <>
                      <span className="text-xs" style={{ color: '#64748B' }}>Disconnect?</span>
                      <button
                        onClick={() => confirmDisconnect(s)}
                        className="text-xs font-medium px-3 py-1.5 rounded-lg"
                        style={{ background: 'rgba(239,68,68,0.12)', color: '#F87171', border: '1px solid rgba(239,68,68,0.22)' }}
                      >
                        Confirm
                      </button>
                      <button
                        onClick={() => setDisconnect(s.id, 'idle')}
                        className="text-xs font-medium px-3 py-1.5 rounded-lg hover:bg-white/5"
                        style={{ color: '#64748B', border: '1px solid rgba(255,255,255,0.08)' }}
                      >
                        Cancel
                      </button>
                    </>
                  ) : dcPhase === 'deleting' ? (
                    <span className="text-xs" style={{ color: '#475569' }}>Removing…</span>
                  ) : (
                    <>
                      {/* Status badge */}
                      <span className="flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-md" style={cfg.badgeStyle}>
                        {cfg.icon}
                        {cfg.label}
                      </span>

                      {/* Configure / Retry button */}
                      {(status === 'pending_configuration' || status === 'failed') && (
                        <button
                          onClick={() => setEditingSource(s)}
                          className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
                          style={{ background: 'rgba(99,102,241,0.10)', color: '#818CF8', border: '1px solid rgba(99,102,241,0.20)' }}
                        >
                          {status === 'failed' ? <><RefreshCw size={11} /> Retry</> : <><ChevronRight size={11} /> Configure</>}
                        </button>
                      )}
                      {status === 'active' && (
                        <button
                          onClick={() => setEditingSource(s)}
                          className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg transition-colors hover:bg-white/5"
                          style={{ color: '#94A3B8', border: '1px solid rgba(255,255,255,0.10)' }}
                        >
                          <Settings2 size={11} /> Configure
                        </button>
                      )}

                      {/* Disconnect */}
                      <button
                        onClick={() => setDisconnect(s.id, 'confirm')}
                        className="p-1.5 rounded-lg transition-colors hover:bg-white/5"
                        style={{ color: '#475569' }}
                        title={`Disconnect ${label}`}
                      >
                        <Unplug size={13} />
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {editingSource && (
        <CredentialEditor
          source={editingSource}
          sourceLabel={SOURCE_LABELS[editingSource.source_type] ?? editingSource.source_type}
          sourceIcon={SOURCE_ICONS[editingSource.source_type] ?? '🔌'}
          onClose={() => setEditingSource(null)}
          onSaved={() => { setEditingSource(null); router.refresh(); }}
        />
      )}
    </>
  );
}
