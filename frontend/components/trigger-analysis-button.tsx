'use client';

import { useState } from 'react';
import { Play } from 'lucide-react';

const PATH_MAP: Record<string, string> = {
  voc: 'insights/analyze',
  signals: 'signals/analyze',
  journey: 'journeys/analyze',
};

const LABELS: Record<string, string> = {
  idle: 'Trigger Analysis',
  loading: 'Running…',
  done: 'Queued!',
  error: 'Failed — retry',
};

type State = 'idle' | 'loading' | 'done' | 'error';

export default function TriggerAnalysisButton({ agent }: { agent: 'voc' | 'signals' | 'journey' }) {
  const [state, setState] = useState<State>('idle');

  async function trigger() {
    setState('loading');
    try {
      const res = await fetch(`/api/backend/${PATH_MAP[agent]}`, { method: 'POST' });
      setState(res.ok ? 'done' : 'error');
    } catch {
      setState('error');
    }
    setTimeout(() => setState('idle'), 4000);
  }

  return (
    <button
      onClick={() => void trigger()}
      disabled={state === 'loading'}
      className="mt-4 flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all disabled:opacity-50 mx-auto"
      style={{
        background: 'rgba(99,102,241,0.12)',
        color: '#818CF8',
        border: '1px solid rgba(99,102,241,0.20)',
      }}
    >
      <Play size={14} />
      {LABELS[state]}
    </button>
  );
}
