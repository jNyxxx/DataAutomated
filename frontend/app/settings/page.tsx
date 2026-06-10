import { cookies } from 'next/headers';
import { apiRequest } from '@/lib/api';
import DataSourceManager from '@/components/data-source-manager';

interface DataSource {
  id: string;
  source_type: string;
  is_active: boolean;
  last_synced_at: string | null;
  created_at: string;
}

const SOURCE_LABELS: Record<string, string> = {
  zendesk: 'Zendesk',
  typeform: 'Typeform',
  intercom: 'Intercom',
  mixpanel: 'Mixpanel',
  segment: 'Segment',
  shopify: 'Shopify',
  g2: 'G2 Reviews',
  news: 'News / Web',
};

const SOURCE_CATEGORIES = {
  'VoC (Customer Feedback)': ['zendesk', 'typeform', 'intercom'],
  'Competitive Intelligence': ['g2', 'news'],
  'Behavioral Journey': ['mixpanel', 'segment', 'shopify'],
};

export default async function SettingsPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get('token')!.value;
  const res = await apiRequest<{ sources: DataSource[] }>('/api/data-sources', token).catch(() => null);
  const sources = res?.sources ?? [];

  return (
    <div className="p-6 space-y-6 max-w-3xl">
      <h1 className="text-xl font-semibold">Settings</h1>

      <section className="space-y-4">
        <h2 className="text-sm font-medium text-gray-700 uppercase tracking-wide">Connected Data Sources</h2>
        {sources.length > 0 ? (
          <div className="bg-white border border-gray-200 rounded-xl divide-y divide-gray-100">
            {sources.map((s) => (
              <div key={s.id} className="flex items-center px-4 py-3 gap-3">
                <div className={`w-2 h-2 rounded-full shrink-0 ${s.is_active ? 'bg-green-400' : 'bg-gray-300'}`} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-gray-900">
                    {SOURCE_LABELS[s.source_type] ?? s.source_type}
                  </div>
                  {s.last_synced_at && (
                    <div className="text-xs text-gray-400">
                      Last synced {s.last_synced_at.slice(0, 10)}
                    </div>
                  )}
                </div>
                <span className={`text-xs font-medium px-2 py-0.5 rounded ${
                  s.is_active ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'
                }`}>
                  {s.is_active ? 'Active' : 'Inactive'}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-white border border-dashed border-gray-300 rounded-xl p-8 text-center">
            <p className="text-gray-400 text-sm">No data sources connected yet.</p>
          </div>
        )}
      </section>

      <section className="space-y-4">
        <h2 className="text-sm font-medium text-gray-700 uppercase tracking-wide">Connect a New Source</h2>
        <DataSourceManager token={token} categories={SOURCE_CATEGORIES} sourceLabels={SOURCE_LABELS} />
      </section>
    </div>
  );
}
