'use client';

import { useState } from 'react';

interface Props {
  token: string;
  categories: Record<string, string[]>;
  sourceLabels: Record<string, string>;
}

export default function DataSourceManager({ token, categories, sourceLabels }: Props) {
  const [sourceType, setSourceType] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  const allTypes = Object.values(categories).flat();

  async function connect() {
    if (!sourceType) return;
    setStatus('loading');
    setErrorMsg('');
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/data-sources`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
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
      setTimeout(() => {
        setStatus('idle');
        window.location.reload();
      }, 1500);
    } catch {
      setStatus('error');
      setErrorMsg('Network error — check your connection');
    }
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
      <p className="text-xs text-gray-500">
        Select the integration type to connect. You will configure credentials in the source settings after connection.
      </p>

      <div className="grid grid-cols-1 gap-3">
        {Object.entries(categories).map(([category, types]) => (
          <div key={category}>
            <div className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">{category}</div>
            <div className="flex flex-wrap gap-2">
              {types.map((type) => (
                <button
                  key={type}
                  onClick={() => setSourceType(type === sourceType ? '' : type)}
                  className={`px-3 py-1.5 rounded-lg text-sm border transition-colors ${
                    sourceType === type
                      ? 'bg-indigo-600 border-indigo-600 text-white'
                      : 'bg-white border-gray-200 text-gray-700 hover:border-indigo-300'
                  }`}
                >
                  {sourceLabels[type] ?? type}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      {sourceType && (
        <div className="pt-2 border-t border-gray-100 flex items-center gap-3">
          <span className="text-sm text-gray-700">
            Connect <strong>{sourceLabels[sourceType] ?? sourceType}</strong>
          </span>
          <button
            onClick={connect}
            disabled={status === 'loading'}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              status === 'done'
                ? 'bg-green-100 text-green-700'
                : status === 'error'
                ? 'bg-red-100 text-red-700'
                : 'bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-60'
            }`}
          >
            {status === 'loading' ? 'Connecting…' : status === 'done' ? 'Connected!' : 'Connect'}
          </button>
          {status === 'error' && <span className="text-xs text-red-600">{errorMsg}</span>}
        </div>
      )}
    </div>
  );
}
