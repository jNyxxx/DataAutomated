'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { createConnectionAction } from '@/app/(dashboard)/settings/actions';

// ── Per-source credential field definitions ──────────────────────────────────
// Each source maps to a list of fields that the user must fill in.
// The key property becomes the credential object key sent to the backend.
// `textarea: true` renders a <textarea> for long values (e.g. JSON blobs).

interface CredField {
  key: string;
  label: string;
  placeholder: string;
  required: boolean;
  textarea?: boolean;
  hint?: string;
  target?: 'credentials' | 'config';
}

const CRED_FIELDS: Record<string, CredField[]> = {
  zendesk: [
    { key: 'subdomain',  label: 'Subdomain',   placeholder: 'yourcompany (before .zendesk.com)', required: true },
    { key: 'email',      label: 'Agent email',  placeholder: 'agent@yourcompany.com',              required: true },
    { key: 'api_token',  label: 'API token',    placeholder: 'Zendesk API token',                  required: true },
  ],
  typeform: [
    { key: 'access_token', label: 'Personal Access Token', placeholder: 'tfp_…', required: true,
      hint: 'Typeform → Account Settings → Personal Tokens' },
    { key: 'form_id', label: 'Form ID', placeholder: 'abc123XYZ', required: true,
      hint: 'Typeform → Open the form → copy the form ID from the URL', target: 'config' },
  ],
  intercom: [
    { key: 'access_token', label: 'Access Token', placeholder: 'Intercom access token', required: true,
      hint: 'Intercom Developer Hub → Your App → Configure → Authentication' },
  ],
  hubspot: [
    { key: 'access_token', label: 'Private App Token', placeholder: 'pat-na1-…', required: true,
      hint: 'HubSpot Settings → Integrations → Private Apps → Create app' },
  ],
  news: [
    { key: 'api_key', label: 'NewsAPI Key', placeholder: 'NewsAPI key', required: true,
      hint: 'newsapi.org/account' },
  ],
  reddit: [
    { key: 'client_id',     label: 'App Client ID',     placeholder: 'Reddit app client ID', required: true },
    { key: 'client_secret', label: 'App Client Secret', placeholder: 'Reddit app client secret', required: true },
    { key: 'user_agent',    label: 'User Agent',         placeholder: 'dataautomated:v1 (by u/yourusername)', required: true,
      hint: 'Required by Reddit TOS — reddit.com/prefs/apps' },
  ],
  google_news: [
    { key: 'api_key', label: 'SerpAPI Key', placeholder: 'SerpAPI key', required: true,
      hint: 'serpapi.com/manage-api-key' },
  ],
  mixpanel: [
    { key: 'api_secret', label: 'API Secret', placeholder: 'Mixpanel project API secret', required: true,
      hint: 'Mixpanel → Project Settings → Access Keys' },
  ],
  segment: [
    { key: 'access_token', label: 'Access Token',   placeholder: 'Segment access token',     required: true },
    { key: 'space_id',     label: 'Space ID',        placeholder: 'Segment Profiles space ID', required: true,
      hint: 'Segment → Unify → Space Settings' },
  ],
  shopify: [
    { key: 'shop_domain',   label: 'Shop domain',     placeholder: 'yourstore.myshopify.com', required: true },
    { key: 'access_token',  label: 'Admin API token', placeholder: 'shpat_…',                required: true,
      hint: 'Shopify Admin → Apps → Develop apps → Create an app' },
  ],
  ga4: [
    { key: 'property_id',      label: 'GA4 Property ID',      placeholder: '123456789', required: true,
      hint: 'GA4 Admin → Property Settings → Property ID' },
    { key: 'credentials_json', label: 'Service Account JSON',  placeholder: 'Paste the full service account JSON key file contents', required: true,
      textarea: true, hint: 'GCP Console → IAM → Service Accounts → Create Key (JSON)' },
  ],
  g2:           [],
  capterra:     [],
  linkedin_jobs: [],
};

// ── Platform catalogue ────────────────────────────────────────────────────────

type Platform = {
  id: string;
  name: string;
  desc: string;
  category: 'voc' | 'compsig' | 'journey';
  credentialsRequired: boolean;
};

const PLATFORMS: Platform[] = [
  // VoC
  { id: 'zendesk',      name: 'Zendesk',           desc: 'Support tickets',          category: 'voc',     credentialsRequired: true },
  { id: 'intercom',     name: 'Intercom',           desc: 'Chat & inbox',             category: 'voc',     credentialsRequired: true },
  { id: 'typeform',     name: 'Typeform',           desc: 'Surveys & forms',          category: 'voc',     credentialsRequired: true },
  { id: 'hubspot',      name: 'HubSpot',            desc: 'CRM & support tickets',    category: 'voc',     credentialsRequired: true },
  // CompSig
  { id: 'news',         name: 'NewsAPI',            desc: 'Competitive news',         category: 'compsig', credentialsRequired: true },
  { id: 'reddit',       name: 'Reddit',             desc: 'Community sentiment',      category: 'compsig', credentialsRequired: true },
  { id: 'google_news',  name: 'Google News',        desc: 'News via SerpAPI',         category: 'compsig', credentialsRequired: true },
  { id: 'g2',           name: 'G2',                 desc: 'Product reviews (public)', category: 'compsig', credentialsRequired: false },
  { id: 'capterra',     name: 'Capterra',           desc: 'Reviews (public)',         category: 'compsig', credentialsRequired: false },
  // Journey
  { id: 'mixpanel',     name: 'Mixpanel',           desc: 'Product events',           category: 'journey', credentialsRequired: true },
  { id: 'segment',      name: 'Segment',            desc: 'Event pipeline',           category: 'journey', credentialsRequired: true },
  { id: 'shopify',      name: 'Shopify',            desc: 'Orders & storefront',      category: 'journey', credentialsRequired: true },
  { id: 'ga4',          name: 'Google Analytics 4', desc: 'Web & app analytics',      category: 'journey', credentialsRequired: true },
];

const CATEGORY_LABEL: Record<string, string> = { voc: 'Voice-of-Customer', compsig: 'Competitive Signals', journey: 'Journey Analytics' };

// ── Component ─────────────────────────────────────────────────────────────────

export function AddConnectionModal({ onAdd }: { onAdd?: () => void }) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [selected, setSelected] = useState<Platform | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function closeAll() {
    setIsOpen(false);
    setSelected(null);
    setFields({});
    setError(null);
    setLoading(false);
  }

  function selectPlatform(p: Platform) {
    setSelected(p);
    setFields({});
    setError(null);
    setLoading(false);
  }

  async function handleConnect(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const defs = CRED_FIELDS[selected!.id] ?? [];
      const credentials: Record<string, string> = {};
      const config: Record<string, string> = {};

      for (const def of defs) {
        const raw = fields[def.key] ?? '';
        const value = raw.trim();
        if (!value) continue;
        if (def.target === 'config') {
          config[def.key] = value;
        } else {
          credentials[def.key] = value;
        }
      }

      await createConnectionAction(
        selected!.id,
        credentials,
        Object.keys(config).length > 0 ? config : undefined,
      );
      closeAll();
      onAdd?.();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Connection failed');
      setLoading(false);
    }
  }

  const categoryGroups = (['voc', 'compsig', 'journey'] as const).map((cat) => ({
    label: CATEGORY_LABEL[cat],
    platforms: PLATFORMS.filter((p) => p.category === cat),
  }));

  return (
    <>
      <Button variant="primary" size="sm" className="h-8" onClick={() => setIsOpen(true)}>
        + Add connection
      </Button>

      {/* Platform list slide-over */}
      {isOpen && !selected && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={closeAll} />
          <div className="absolute right-0 top-0 flex h-full w-full max-w-md flex-col bg-slate-800 shadow-2xl shadow-black/50 ring-1 ring-white/10 animate-in slide-in-from-right duration-300">
            <div className="flex items-start justify-between gap-3 px-5 py-4">
              <div>
                <h3 className="text-base font-semibold text-white">Add a connection</h3>
                <p className="mt-0.5 text-sm text-slate-400">Choose a data source</p>
              </div>
              <button onClick={closeAll} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-700 hover:text-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                <X className="size-5" />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-2">
              {categoryGroups.map(({ label, platforms }) => (
                <div key={label} className="mb-5">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</p>
                  <div className="space-y-1.5">
                    {platforms.map((p) => (
                      <button
                        key={p.id}
                        onClick={() => selectPlatform(p)}
                        className="flex w-full items-center gap-3 rounded-lg bg-slate-900/50 p-3 text-left transition-colors hover:bg-slate-900/90 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-slate-700/50 text-xs font-semibold uppercase text-slate-200">
                          {p.name.charAt(0)}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium text-slate-100">{p.name}</span>
                          <span className="block truncate text-xs text-slate-400">{p.desc}</span>
                        </span>
                        {!p.credentialsRequired && (
                          <Badge variant="success">Auto-connect</Badge>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Credential form modal */}
      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={closeAll} />
          <div className="relative z-10 w-full max-w-md overflow-hidden rounded-2xl bg-slate-800 shadow-2xl shadow-black/50 ring-1 ring-white/10 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between gap-3 px-5 py-4">
              <h3 className="text-base font-semibold text-white">Connect {selected.name}</h3>
              <button onClick={closeAll} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-700 hover:text-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                <X className="size-5" />
              </button>
            </div>

            <form onSubmit={handleConnect}>
              <div className="max-h-[60vh] overflow-y-auto px-5 pb-1">
                {!selected.credentialsRequired ? (
                  <p className="py-4 text-sm text-slate-400">
                    {selected.name} connects automatically — no credentials needed. Click Save to activate it.
                  </p>
                ) : (
                  <div className="space-y-4 py-1">
                    {(CRED_FIELDS[selected.id] ?? []).map((f) => (
                      <label key={f.key} className="block">
                        <span className="mb-1.5 block text-xs font-medium text-slate-400">
                          {f.label}{f.required && <span className="ml-0.5 text-rose-400">*</span>}
                        </span>
                        {f.textarea ? (
                          <textarea
                            required={f.required}
                            rows={5}
                            value={fields[f.key] ?? ''}
                            onChange={(e) => setFields((prev) => ({ ...prev, [f.key]: e.target.value }))}
                            placeholder={f.placeholder}
                            className="w-full rounded-lg bg-slate-950/50 px-3 py-2 font-mono text-xs text-slate-200 ring-1 ring-inset ring-slate-800 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        ) : (
                          <input
                            required={f.required}
                            value={fields[f.key] ?? ''}
                            onChange={(e) => setFields((prev) => ({ ...prev, [f.key]: e.target.value }))}
                            placeholder={f.placeholder}
                            className="h-9 w-full rounded-lg bg-slate-950/50 px-3 text-sm text-slate-200 ring-1 ring-inset ring-slate-800 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        )}
                        {f.hint && (
                          <p className="mt-1 text-xs text-slate-500">{f.hint}</p>
                        )}
                      </label>
                    ))}
                  </div>
                )}
              </div>

              {error && (
                <div className="mx-5 mb-2 rounded-lg bg-rose-500/10 px-3 py-2 text-xs text-rose-300">
                  {error}
                </div>
              )}

              <div className="mt-4 flex justify-end gap-2 bg-slate-900/40 px-5 py-4">
                <button
                  type="button"
                  onClick={() => setSelected(null)}
                  className="inline-flex h-9 items-center rounded-lg px-3 text-sm font-medium text-slate-300 hover:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  Back
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="inline-flex h-9 items-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-medium text-white hover:bg-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                >
                  {loading ? (
                    <>
                      <span className="inline-block size-4 rounded-full border-2 border-white/70 border-t-transparent animate-spin" />
                      Connecting…
                    </>
                  ) : (
                    'Save connection'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
