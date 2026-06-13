import { cookies } from 'next/headers';
import { apiRequest } from '@/lib/api';
import { DataSource, SOURCE_CATEGORIES } from '@/lib/sources';
import DataSourceManager from '@/components/data-source-manager';
import ConnectedSourcesList from '@/components/connected-sources-list';
import { Settings, PlugZap, Layers, AlertTriangle } from 'lucide-react';

export default async function SettingsPage() {
  const cookieStore = await cookies();
  const token       = cookieStore.get('token')?.value ?? '';
  const res         = await apiRequest<{ sources: DataSource[] }>('/api/data-sources', token).catch(() => null);
  const sources     = res?.sources ?? [];

  const connected = sources.filter((s) => s.is_active);
  const connectedTypes = connected.map((s) => s.source_type);

  const pendingSetup = connected.filter(
    (s) => s.connection_status === 'pending_configuration' || s.connection_status === 'failed'
  );

  return (
    <div className="p-6 max-w-3xl page-enter space-y-10">

      {/* ── Page header ──────────────────────────────────────────── */}
      <div className="flex items-start gap-3">
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 mt-0.5"
          style={{ background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.20)' }}
        >
          <Settings size={17} style={{ color: '#818CF8' }} />
        </div>
        <div>
          <h1 className="text-xl font-bold" style={{ color: '#F1F5F9' }}>Settings</h1>
          <p className="text-sm mt-0.5" style={{ color: '#475569' }}>
            Manage data source connections and integration credentials
          </p>
        </div>
      </div>

      {/* ── Attention banner: integrations need setup ─────────────── */}
      {pendingSetup.length > 0 && (
        <div
          className="flex items-start gap-3 px-4 py-3.5 rounded-xl"
          style={{ background: 'rgba(245,158,11,0.07)', border: '1px solid rgba(245,158,11,0.18)' }}
        >
          <AlertTriangle size={16} className="shrink-0 mt-0.5" style={{ color: '#FBBF24' }} />
          <div>
            <p className="text-sm font-medium" style={{ color: '#FCD34D' }}>
              {pendingSetup.length} integration{pendingSetup.length > 1 ? 's' : ''} need{pendingSetup.length === 1 ? 's' : ''} configuration
            </p>
            <p className="text-xs mt-0.5" style={{ color: '#92400E' }}>
              Click Configure on each source below to enter credentials and run a connection test.
            </p>
          </div>
        </div>
      )}

      {/* ── Connected integrations ─────────────────────────────────── */}
      {connected.length > 0 ? (
        <ConnectedSourcesList sources={connected} />
      ) : (
        /* Empty state — no integrations connected yet */
        <div
          className="rounded-2xl p-12 flex flex-col items-center gap-4 text-center"
          style={{ background: '#0F172A', border: '1px dashed rgba(148,163,184,0.15)' }}
        >
          <div
            className="w-14 h-14 rounded-2xl flex items-center justify-center"
            style={{ background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.15)' }}
          >
            <Layers size={26} style={{ color: '#4F5BA6' }} />
          </div>
          <div>
            <p className="text-base font-semibold" style={{ color: '#CBD5E1' }}>Connect your first source</p>
            <p className="text-sm mt-1.5 max-w-xs mx-auto" style={{ color: '#475569' }}>
              Bring customer feedback, reviews, and behavioral data into one place. Browse integrations below.
            </p>
          </div>
          <div className="flex items-center gap-1.5 text-xs" style={{ color: '#334155' }}>
            <PlugZap size={12} />
            Choose an integration below to get started
          </div>
        </div>
      )}

      {/* ── Integration catalog ────────────────────────────────────── */}
      <section className="space-y-5">
        <div className="flex items-center gap-2.5">
          <PlugZap size={15} style={{ color: '#64748B' }} />
          <h2 className="text-sm font-semibold uppercase tracking-widest" style={{ color: '#475569' }}>
            Available Integrations
          </h2>
          {connectedTypes.length > 0 && (
            <span className="ml-auto text-xs" style={{ color: '#334155' }}>
              Connected sources are hidden
            </span>
          )}
        </div>
        <DataSourceManager
          categories={SOURCE_CATEGORIES}
          connectedTypes={connectedTypes}
        />
      </section>

    </div>
  );
}
