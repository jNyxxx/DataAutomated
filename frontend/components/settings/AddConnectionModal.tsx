'use client';

import { useState } from 'react';
import { X, Check } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

type Platform = {
  id: string;
  name: string;
  desc: string;
  type: 'oauth' | 'apikey';
};

const PLATFORMS: Platform[] = [
  { id: 'zendesk', name: 'Zendesk', desc: 'Support tickets', type: 'oauth' },
  { id: 'intercom', name: 'Intercom', desc: 'Chat & inbox', type: 'oauth' },
  { id: 'typeform', name: 'Typeform', desc: 'Surveys & forms', type: 'oauth' },
  { id: 'g2', name: 'G2', desc: 'Product reviews', type: 'apikey' },
  { id: 'hubspot', name: 'HubSpot', desc: 'CRM & marketing', type: 'oauth' },
  { id: 'mixpanel', name: 'Mixpanel', desc: 'Product events', type: 'oauth' },
  { id: 'stripe', name: 'Stripe', desc: 'Billing & churn', type: 'apikey' },
  { id: 'segment', name: 'Segment', desc: 'Event pipeline', type: 'apikey' },
  { id: 'custom', name: 'Custom webhook', desc: 'Any JSON source', type: 'apikey' },
];

export function AddConnectionModal({ onAdd }: { onAdd?: () => void }) {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedPlatform, setSelectedPlatform] = useState<Platform | null>(null);
  const [loading, setLoading] = useState(false);
  const [apiKey, setApiKey] = useState('');

  function closeAll() {
    setIsOpen(false);
    setSelectedPlatform(null);
    setApiKey('');
  }

  async function handleConnect(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    // Simulate connection flow
    setTimeout(() => {
      setLoading(false);
      closeAll();
      onAdd?.();
      window.location.reload();
    }, 1200);
  }

  return (
    <>
      <Button variant="primary" size="sm" className="h-8" onClick={() => setIsOpen(true)}>
        + Add connection
      </Button>

      {/* Slide-over (Platform Selection) */}
      {isOpen && !selectedPlatform && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={closeAll}></div>
          <div className="absolute right-0 top-0 flex h-full w-full max-w-md flex-col bg-slate-800 shadow-2xl shadow-black/50 ring-1 ring-white/10 animate-in slide-in-from-right duration-300">
            <div className="flex items-start justify-between gap-3 px-5 py-4">
              <div className="min-w-0">
                <h3 className="text-base font-semibold text-white">Add a connection</h3>
                <p className="mt-0.5 text-sm text-slate-400">Choose a platform and method</p>
              </div>
              <button onClick={closeAll} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-700 hover:text-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                <X className="size-5" />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-2">
              <div className="space-y-2 pb-2">
                {PLATFORMS.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => setSelectedPlatform(p)}
                    className="flex w-full items-center gap-3 rounded-lg bg-slate-900/50 p-3 text-left transition-colors hover:bg-slate-900/90 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-slate-700/50 text-xs font-semibold text-slate-200 uppercase">
                      {p.name.charAt(0)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-slate-100">{p.name}</span>
                      <span className="block truncate text-xs text-slate-400">{p.desc}</span>
                    </span>
                    <Badge variant={p.type === 'oauth' ? 'success' : 'info'}>
                      {p.type === 'oauth' ? 'OAuth' : 'API Key'}
                    </Badge>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal (Connect Platform) */}
      {selectedPlatform && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={closeAll}></div>
          <div className="relative z-10 w-full max-w-md overflow-hidden rounded-2xl bg-slate-800 shadow-2xl shadow-black/50 ring-1 ring-white/10 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between gap-3 px-5 py-4">
              <h3 className="text-base font-semibold text-white">Connect {selectedPlatform.name}</h3>
              <button onClick={closeAll} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-700 hover:text-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                <X className="size-5" />
              </button>
            </div>

            <form onSubmit={handleConnect}>
              <div className="px-5 pb-1">
                {selectedPlatform.type === 'oauth' ? (
                  <div className="py-2 text-center">
                    <div className="mx-auto grid size-12 place-items-center rounded-xl bg-slate-700/50 text-base font-semibold text-slate-100 uppercase">
                      {selectedPlatform.name.charAt(0)}
                    </div>
                    <p className="mt-3 text-sm leading-relaxed text-slate-300">
                      You'll be redirected to {selectedPlatform.name} to authorize secure access. We never store your password.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4 py-1">
                    <label className="block">
                      <span className="mb-1.5 block text-xs font-medium text-slate-400">API key</span>
                      <input
                        required
                        value={apiKey}
                        onChange={(e) => setApiKey(e.target.value)}
                        placeholder="sk_live_            "
                        className="h-9 w-full rounded-lg bg-slate-950/50 px-3 font-mono text-sm text-slate-200 ring-1 ring-inset ring-slate-800 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </label>
                    <label className="block">
                      <span className="mb-1.5 block text-xs font-medium text-slate-400">Endpoint (optional)</span>
                      <input
                        placeholder={`https://api.${selectedPlatform.name.toLowerCase().replace(/[^a-z]/g, '')}.com`}
                        className="h-9 w-full rounded-lg bg-slate-950/50 px-3 text-sm text-slate-200 ring-1 ring-inset ring-slate-800 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </label>
                  </div>
                )}
              </div>

              <div className="mt-4 flex justify-end gap-2 bg-slate-900/40 px-5 py-4">
                <button
                  type="button"
                  onClick={() => setSelectedPlatform(null)}
                  className="inline-flex h-9 items-center rounded-lg px-3 text-sm font-medium text-slate-300 hover:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="inline-flex h-9 items-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-medium text-white hover:bg-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                >
                  {loading ? (
                    <>
                      <span className="inline-block size-4 rounded-full border-2 border-white/70 border-t-transparent animate-spin"></span>
                      Connecting...
                    </>
                  ) : selectedPlatform.type === 'oauth' ? (
                    `Authorize with ${selectedPlatform.name}`
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
