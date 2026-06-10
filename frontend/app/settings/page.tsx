import { cookies } from 'next/headers';
import { apiRequest } from '@/lib/api';
import DataSourceManager from '@/components/data-source-manager';
import { Settings, Database, PlugZap } from 'lucide-react';

interface DataSource {
  id: string;
  source_type: string;
  is_active: boolean;
  last_synced_at: string | null;
  created_at: string;
}

const SOURCE_LABELS: Record<string, string> = {
  zendesk:  'Zendesk',
  typeform: 'Typeform',
  intercom: 'Intercom',
  mixpanel: 'Mixpanel',
  segment:  'Segment',
  shopify:  'Shopify',
  g2:       'G2 Reviews',
  news:     'News / Web',
};

const SOURCE_CATEGORIES = {
  'VoC (Customer Feedback)':  ['zendesk', 'typeform', 'intercom'],
  'Competitive Intelligence': ['g2', 'news'],
  'Behavioral Journey':       ['mixpanel', 'segment', 'shopify'],
};

// Badge style per source type
const SOURCE_ICONS: Record<string, string> = {
  zendesk: '🎫', typeform: '📋', intercom: '💬',
  mixpanel: '📊', segment: '🔗', shopify: '🛒',
  g2: '⭐', news: '📰',
};

export default async function SettingsPage() {
  const cookieStore = await cookies();
  const token       = cookieStore.get('token')!.value;
  const res         = await apiRequest<{ sources: DataSource[] }>('/api/data-sources', token).catch(() => null);
  const sources     = res?.sources ?? [];

  return (
    <div className="p-6 space-y-8 max-w-3xl page-enter">
      {/* Header */}
      <div className="flex items-center gap-2.5">
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center"
          style={{ background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.20)' }}
        >
          <Settings size={16} style={{ color: '#818CF8' }} />
        </div>
        <div>
          <h1 className="text-xl font-bold" style={{ color: '#F1F5F9' }}>Settings</h1>
          <p className="text-sm" style={{ color: '#475569' }}>
            Manage data sources and integrations
          </p>
        </div>
      </div>

      {/* Connected sources */}
      <section className="space-y-3">
        <div className="flex items-center gap-2 mb-4">
          <Database size={15} style={{ color: '#64748B' }} />
          <h2 className="text-sm font-semibold uppercase tracking-widest" style={{ color: '#475569' }}>
            Connected Sources
          </h2>
          {sources.length > 0 && (
            <span
              className="ml-auto text-xs font-medium px-2 py-0.5 rounded-md"
              style={{
                background: 'rgba(16,185,129,0.10)',
                color: '#34D399',
                border: '1px solid rgba(16,185,129,0.20)',
              }}
            >
              {sources.filter((s) => s.is_active).length} active
            </span>
          )}
        </div>

        {sources.length > 0 ? (
          <div
            className="rounded-xl overflow-hidden"
            style={{ border: '1px solid rgba(148,163,184,0.09)' }}
          >
            {sources.map((s, i) => (
              <div
                key={s.id}
                className="flex items-center px-4 py-3.5 gap-4 anim-item hover:bg-[#1a2240] transition-colors duration-150"
                style={{
                  background: '#151E35',
                  borderBottom: i < sources.length - 1 ? '1px solid rgba(148,163,184,0.07)' : 'none',
                  animationDelay: `${i * 50}ms`,
                }}
              >
                {/* Status dot */}
                <div className="relative shrink-0">
                  <span
                    className="w-2 h-2 rounded-full block"
                    style={{
                      background: s.is_active ? '#10B981' : '#334155',
                      boxShadow: s.is_active ? '0 0 6px rgba(16,185,129,0.5)' : 'none',
                    }}
                  />
                </div>

                {/* Emoji + Name */}
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <span className="text-base">{SOURCE_ICONS[s.source_type] ?? '🔌'}</span>
                  <div className="min-w-0">
                    <div className="text-sm font-medium" style={{ color: '#E2E8F0' }}>
                      {SOURCE_LABELS[s.source_type] ?? s.source_type}
                    </div>
                    {s.last_synced_at && (
                      <div className="text-xs tabular-nums" style={{ color: '#334155' }}>
                        Last synced {s.last_synced_at.slice(0, 10)}
                      </div>
                    )}
                  </div>
                </div>

                {/* Active badge */}
                <span
                  className="text-xs font-medium px-2 py-0.5 rounded-md shrink-0"
                  style={
                    s.is_active
                      ? { background: 'rgba(16,185,129,0.10)', color: '#34D399', border: '1px solid rgba(16,185,129,0.20)' }
                      : { background: 'rgba(100,116,139,0.10)', color: '#64748B', border: '1px solid rgba(100,116,139,0.18)' }
                  }
                >
                  {s.is_active ? 'Active' : 'Inactive'}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <Database size={28} className="mx-auto mb-3" style={{ color: '#334155' }} />
            <p className="text-sm font-medium mb-1" style={{ color: '#475569' }}>
              No sources connected
            </p>
            <p className="text-xs" style={{ color: '#334155' }}>
              Connect a data source below to start ingesting insights.
            </p>
          </div>
        )}
      </section>

      {/* Connect new source */}
      <section className="space-y-3">
        <div className="flex items-center gap-2 mb-4">
          <PlugZap size={15} style={{ color: '#64748B' }} />
          <h2 className="text-sm font-semibold uppercase tracking-widest" style={{ color: '#475569' }}>
            Connect a New Source
          </h2>
        </div>
        <DataSourceManager token={token} categories={SOURCE_CATEGORIES} sourceLabels={SOURCE_LABELS} />
      </section>
    </div>
  );
}
