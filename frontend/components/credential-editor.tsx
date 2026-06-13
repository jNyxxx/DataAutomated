'use client';

import { useState, useEffect } from 'react';
import { X, Save, AlertCircle, CheckCircle, Loader2, Wifi, WifiOff, ShieldCheck } from 'lucide-react';
import type { DataSource, ConnectionStatus } from '@/lib/sources';

interface Props {
  source: DataSource;
  sourceLabel: string;
  sourceIcon: string;
  onClose: () => void;
  onSaved: () => void;
}

interface FieldDef {
  key: string;
  label: string;
  type: 'text' | 'password';
  placeholder: string;
  storeIn: 'credentials' | 'config';
  helpText?: string;
}

const FIELDS: Record<string, FieldDef[]> = {
  zendesk: [
    { key: 'subdomain',  label: 'Subdomain',    type: 'text',     placeholder: 'yourcompany',          storeIn: 'credentials', helpText: 'Part before .zendesk.com' },
    { key: 'email',      label: 'Agent Email',  type: 'text',     placeholder: 'agent@company.com',    storeIn: 'credentials' },
    { key: 'api_token',  label: 'API Token',    type: 'password', placeholder: 'From Zendesk Admin › API', storeIn: 'credentials' },
  ],
  typeform: [
    { key: 'access_token', label: 'Personal Access Token', type: 'password', placeholder: 'tfp_...', storeIn: 'credentials', helpText: 'Create in Typeform account settings' },
    { key: 'form_id',      label: 'Form ID',               type: 'text',     placeholder: 'abc123',  storeIn: 'config',       helpText: 'Found in the form URL' },
  ],
  intercom: [
    { key: 'access_token', label: 'Access Token', type: 'password', placeholder: 'Intercom access token', storeIn: 'credentials', helpText: 'From Intercom developer hub' },
  ],
  mixpanel: [
    { key: 'api_secret', label: 'API Secret', type: 'password', placeholder: 'Mixpanel project API secret', storeIn: 'credentials' },
  ],
  segment: [
    { key: 'space_id',      label: 'Space ID',                     type: 'text',     placeholder: 'Segment Space ID',       storeIn: 'credentials' },
    { key: 'access_token',  label: 'Access Token',                  type: 'password', placeholder: 'Segment access token',   storeIn: 'credentials' },
    { key: 'user_ids',      label: 'User IDs (comma-separated)',    type: 'text',     placeholder: 'user1,user2,...',        storeIn: 'config',       helpText: 'Profiles to fetch events for' },
  ],
  shopify: [
    { key: 'shop_domain',   label: 'Shop Domain',              type: 'text',     placeholder: 'yourstore.myshopify.com', storeIn: 'credentials' },
    { key: 'access_token',  label: 'Admin API Access Token',   type: 'password', placeholder: 'shpat_...',               storeIn: 'credentials' },
  ],
  news: [
    { key: 'api_key', label: 'NewsAPI Key', type: 'password', placeholder: 'From newsapi.org', storeIn: 'credentials' },
  ],
  competitor_monitor: [
    { key: 'competitors', label: 'Competitors (comma-separated)', type: 'text', placeholder: 'Salesforce, HubSpot, Pipedrive', storeIn: 'config', helpText: 'Company names to monitor across all intelligence sources' },
  ],
  g2:           [],
  capterra:     [],
  linkedin_jobs:[],
};

// Test step messages shown while validation runs
const TEST_STEPS = [
  'Authenticating...',
  'Validating credentials...',
  'Checking API access...',
];

function buildPayload(sourceType: string, values: Record<string, string>) {
  const fields = FIELDS[sourceType] ?? [];
  const credentials: Record<string, string> = {};
  const config: Record<string, string> = {};
  for (const field of fields) {
    const val = values[field.key]?.trim();
    if (!val) continue;
    if (field.storeIn === 'credentials') credentials[field.key] = val;
    else config[field.key] = val;
  }
  const result: { credentials?: Record<string, string>; config?: Record<string, string> } = {};
  if (Object.keys(credentials).length) result.credentials = credentials;
  if (Object.keys(config).length) result.config = config;
  return result;
}

type ModalPhase = 'form' | 'testing' | 'success' | 'failed';

export default function CredentialEditor({ source, sourceLabel, sourceIcon, onClose, onSaved }: Props) {
  const fields = FIELDS[source.source_type] ?? [];
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(fields.map((f) => [f.key, '']))
  );
  const [phase, setPhase] = useState<ModalPhase>('form');
  const [saveError, setSaveError] = useState('');
  const [testError, setTestError] = useState('');
  const [testStep, setTestStep] = useState(0);

  const noFields = fields.length === 0;

  // Animate test steps
  useEffect(() => {
    if (phase !== 'testing') return;
    setTestStep(0);
    const timers = TEST_STEPS.map((_, i) =>
      setTimeout(() => setTestStep(i), i * 700)
    );
    return () => timers.forEach(clearTimeout);
  }, [phase]);

  async function saveCredentials(): Promise<boolean> {
    const payload = buildPayload(source.source_type, values);
    if (!noFields && !Object.keys(payload).length) {
      setSaveError('Fill in at least one field before saving.');
      return false;
    }
    setSaveError('');
    const res = await fetch(`/api/backend/api/data-sources/${source.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const data = await res.json() as { detail?: string };
      setSaveError(data.detail ?? 'Save failed');
      return false;
    }
    return true;
  }

  async function handleTestConnection() {
    const ok = await saveCredentials();
    if (!ok) return;

    setPhase('testing');
    // Wait for step animations, then call backend
    await new Promise((r) => setTimeout(r, TEST_STEPS.length * 700 + 400));

    try {
      const res = await fetch(`/api/backend/api/data-sources/${source.id}/test`, {
        method: 'POST',
      });
      const data = await res.json() as { connection_status?: ConnectionStatus; error?: string };
      if (data.connection_status === 'active') {
        setPhase('success');
        setTimeout(() => { onSaved(); }, 1800);
      } else {
        setTestError(data.error ?? 'Connection test failed. Check your credentials.');
        setPhase('failed');
      }
    } catch {
      setTestError('Network error — could not reach the server.');
      setPhase('failed');
    }
  }

  async function handleSaveOnly() {
    const ok = await saveCredentials();
    if (ok) onSaved();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.70)', backdropFilter: 'blur(6px)' }}
      onClick={(e) => { if (e.target === e.currentTarget && phase !== 'testing') onClose(); }}
    >
      <div
        className="w-full max-w-md rounded-2xl overflow-hidden"
        style={{ background: '#0B1120', border: '1px solid rgba(148,163,184,0.12)', boxShadow: '0 25px 60px rgba(0,0,0,0.6)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-4" style={{ borderBottom: '1px solid rgba(148,163,184,0.08)' }}>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center text-lg" style={{ background: 'rgba(99,102,241,0.10)', border: '1px solid rgba(99,102,241,0.15)' }}>
              {sourceIcon}
            </div>
            <div>
              <h3 className="text-sm font-semibold" style={{ color: '#F1F5F9' }}>
                {phase === 'testing' ? 'Testing Connection' : phase === 'success' ? 'Connected!' : phase === 'failed' ? 'Connection Failed' : `Configure ${sourceLabel}`}
              </h3>
              <p className="text-xs mt-0.5" style={{ color: '#475569' }}>
                {phase === 'testing' ? 'Validating your credentials…' : phase === 'success' ? `${sourceLabel} is now active` : phase === 'failed' ? 'Check your credentials and retry' : 'Credentials are AES-256 encrypted before storage'}
              </p>
            </div>
          </div>
          {phase !== 'testing' && (
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/5 transition-colors" style={{ color: '#475569' }}>
              <X size={16} />
            </button>
          )}
        </div>

        {/* Body */}
        <div className="px-6 py-5">
          {/* ── Testing phase ── */}
          {phase === 'testing' && (
            <div className="py-6 space-y-5">
              <div className="flex items-center justify-center">
                <div className="relative w-16 h-16">
                  <svg className="absolute inset-0 animate-spin" viewBox="0 0 64 64">
                    <circle cx="32" cy="32" r="28" fill="none" stroke="rgba(99,102,241,0.15)" strokeWidth="4" />
                    <circle cx="32" cy="32" r="28" fill="none" stroke="#6366F1" strokeWidth="4"
                      strokeDasharray="44 132" strokeLinecap="round" />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <Wifi size={22} style={{ color: '#818CF8' }} />
                  </div>
                </div>
              </div>
              <div className="space-y-2.5">
                {TEST_STEPS.map((step, i) => (
                  <div
                    key={step}
                    className="flex items-center gap-3 px-4 py-2.5 rounded-lg transition-all duration-300"
                    style={{
                      background: i <= testStep ? 'rgba(99,102,241,0.08)' : 'transparent',
                      border: `1px solid ${i <= testStep ? 'rgba(99,102,241,0.15)' : 'rgba(148,163,184,0.06)'}`,
                      opacity: i > testStep ? 0.3 : 1,
                    }}
                  >
                    {i < testStep ? (
                      <CheckCircle size={14} style={{ color: '#34D399', flexShrink: 0 }} />
                    ) : i === testStep ? (
                      <Loader2 size={14} className="animate-spin" style={{ color: '#818CF8', flexShrink: 0 }} />
                    ) : (
                      <div className="w-3.5 h-3.5 rounded-full" style={{ background: 'rgba(148,163,184,0.2)', flexShrink: 0 }} />
                    )}
                    <span className="text-sm" style={{ color: i <= testStep ? '#CBD5E1' : '#475569' }}>{step}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Success phase ── */}
          {phase === 'success' && (
            <div className="py-8 flex flex-col items-center gap-4">
              <div className="w-16 h-16 rounded-full flex items-center justify-center" style={{ background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.25)' }}>
                <CheckCircle size={32} style={{ color: '#10B981' }} />
              </div>
              <div className="text-center space-y-1">
                <p className="text-sm font-semibold" style={{ color: '#F1F5F9' }}>Connection validated</p>
                <p className="text-xs" style={{ color: '#64748B' }}>{sourceLabel} is now active and syncing</p>
              </div>
            </div>
          )}

          {/* ── Failed phase ── */}
          {phase === 'failed' && (
            <div className="py-6 space-y-4">
              <div className="flex items-center justify-center">
                <div className="w-16 h-16 rounded-full flex items-center justify-center" style={{ background: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.20)' }}>
                  <WifiOff size={28} style={{ color: '#F87171' }} />
                </div>
              </div>
              <div
                className="flex items-start gap-2.5 px-4 py-3 rounded-xl text-sm"
                style={{ background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.18)', color: '#FCA5A5' }}
              >
                <AlertCircle size={15} className="shrink-0 mt-0.5" style={{ color: '#F87171' }} />
                <span>{testError}</span>
              </div>
              <div className="flex gap-2.5">
                <button
                  onClick={() => setPhase('form')}
                  className="flex-1 py-2 rounded-lg text-sm font-medium transition-colors"
                  style={{ background: 'rgba(99,102,241,0.10)', color: '#818CF8', border: '1px solid rgba(99,102,241,0.20)' }}
                >
                  Edit Credentials
                </button>
                <button
                  onClick={handleTestConnection}
                  className="flex-1 py-2 rounded-lg text-sm font-semibold transition-colors"
                  style={{ background: 'linear-gradient(135deg, #6366F1, #8B5CF6)', color: 'white' }}
                >
                  Retry
                </button>
              </div>
            </div>
          )}

          {/* ── Form phase ── */}
          {phase === 'form' && (
            <div className="space-y-4">
              {noFields ? (
                <div className="py-6 flex flex-col items-center gap-3 text-center">
                  <ShieldCheck size={28} style={{ color: '#334155' }} />
                  <div>
                    <p className="text-sm font-medium" style={{ color: '#CBD5E1' }}>No credentials required</p>
                    <p className="text-xs mt-1" style={{ color: '#475569' }}>
                      {['g2', 'capterra', 'linkedin_jobs'].includes(source.source_type)
                        ? 'This source uses public data. Click Test Connection to activate.'
                        : 'This source activates automatically.'}
                    </p>
                  </div>
                </div>
              ) : (
                fields.map((field) => (
                  <div key={field.key} className="space-y-1.5">
                    <label className="block text-xs font-medium" style={{ color: '#94A3B8' }}>
                      {field.label}
                    </label>
                    <input
                      type={field.type}
                      value={values[field.key] ?? ''}
                      onChange={(e) => setValues((prev) => ({ ...prev, [field.key]: e.target.value }))}
                      placeholder={field.placeholder}
                      autoComplete={field.type === 'password' ? 'new-password' : 'off'}
                      className="w-full rounded-lg px-3 py-2.5 text-sm outline-none transition-colors"
                      style={{ background: '#0F172A', border: '1px solid rgba(148,163,184,0.12)', color: '#E2E8F0' }}
                      onFocus={(e) => (e.currentTarget.style.borderColor = 'rgba(99,102,241,0.5)')}
                      onBlur={(e) => (e.currentTarget.style.borderColor = 'rgba(148,163,184,0.12)')}
                    />
                    {field.helpText && (
                      <p className="text-[11px]" style={{ color: '#475569' }}>{field.helpText}</p>
                    )}
                  </div>
                ))
              )}

              {saveError && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.18)', color: '#F87171' }}>
                  <AlertCircle size={13} />
                  {saveError}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer actions */}
        {(phase === 'form') && (
          <div className="flex items-center justify-between px-6 pb-6 gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-sm transition-colors hover:bg-white/5"
              style={{ color: '#64748B', border: '1px solid rgba(148,163,184,0.12)' }}
            >
              Cancel
            </button>
            <div className="flex gap-2">
              {!noFields && (
                <button
                  onClick={handleSaveOnly}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm transition-colors hover:bg-white/5"
                  style={{ color: '#94A3B8', border: '1px solid rgba(148,163,184,0.15)' }}
                >
                  <Save size={13} />
                  Save only
                </button>
              )}
              <button
                onClick={handleTestConnection}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold"
                style={{ background: 'linear-gradient(135deg, #6366F1, #8B5CF6)', color: 'white' }}
              >
                <Wifi size={13} />
                Test Connection
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
