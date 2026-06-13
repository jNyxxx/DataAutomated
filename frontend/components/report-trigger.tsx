'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { FileBarChart2, CheckCircle, AlertCircle, Loader2, X, Sparkles } from 'lucide-react';

interface Props {
  /** Current number of reports in the list — used to detect when a new one lands. */
  initialReportCount?: number;
}

type Phase = 'idle' | 'queuing' | 'generating' | 'done' | 'error';

// Rotating messages shown while the AI works
const GENERATING_STEPS = [
  'Reading customer feedback data…',
  'Analysing sentiment trends…',
  'Scanning competitive signals…',
  'Reviewing journey insights…',
  'Drafting executive summary…',
  'Finalising report…',
];

export default function ReportTrigger({ initialReportCount = 0 }: Props) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>('idle');
  const [stepIdx, setStepIdx] = useState(0);
  const [progress, setProgress] = useState(0);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const progressRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function clearTimers() {
    if (pollRef.current)     clearInterval(pollRef.current);
    if (progressRef.current) clearInterval(progressRef.current);
    if (timeoutRef.current)  clearTimeout(timeoutRef.current);
  }

  // When generating starts, animate progress bar and cycle step messages
  useEffect(() => {
    if (phase !== 'generating') return;
    setStepIdx(0);
    setProgress(0);

    // Progress bar: reach ~90% over 35 s then stall (we'll jump to 100 on completion)
    const TOTAL_MS = 35_000;
    const TICK_MS  = 300;
    let elapsed = 0;
    progressRef.current = setInterval(() => {
      elapsed += TICK_MS;
      // Ease-out curve so it slows near 90%
      const pct = 90 * (1 - Math.exp(-elapsed / TOTAL_MS * 2.5));
      setProgress(Math.min(pct, 90));
    }, TICK_MS);

    // Cycle step labels every ~5 s
    const stepTimer = setInterval(() => {
      setStepIdx((i) => (i + 1) % GENERATING_STEPS.length);
    }, 5000);

    // Poll the reports list every 4 s to detect completion
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch('/api/backend/api/reports/list', { cache: 'no-store' });
        if (!res.ok) return;
        const data = await res.json() as { reports?: unknown[] };
        const count = data.reports?.length ?? 0;
        if (count > initialReportCount) {
          finish(true);
        }
      } catch { /* network hiccup — keep polling */ }
    }, 4000);

    // Hard cap: 90 s then give up
    timeoutRef.current = setTimeout(() => finish(true), 90_000);

    return () => {
      clearInterval(stepTimer);
      clearTimers();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  function finish(success: boolean) {
    clearTimers();
    setProgress(100);
    setPhase(success ? 'done' : 'error');
    router.refresh();
    setTimeout(() => setPhase('idle'), success ? 4000 : 6000);
  }

  async function trigger() {
    if (phase !== 'idle') return;
    setPhase('queuing');
    try {
      const res = await fetch('/api/backend/api/reports/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ report_type: 'weekly_intelligence', period: 'last_7_days' }),
      });
      if (!res.ok) { setPhase('error'); setTimeout(() => setPhase('idle'), 5000); return; }
      setPhase('generating');
    } catch {
      setPhase('error');
      setTimeout(() => setPhase('idle'), 5000);
    }
  }

  // ── Trigger button ───────────────────────────────────────────────────────
  const btnStyle: React.CSSProperties =
    phase === 'idle' ? { background: 'linear-gradient(135deg,#6366F1,#8B5CF6)', color: 'white' }
    : phase === 'queuing' ? { background: 'rgba(99,102,241,0.15)', color: '#818CF8', border: '1px solid rgba(99,102,241,0.25)', cursor: 'not-allowed' }
    : phase === 'generating' ? { background: 'rgba(99,102,241,0.12)', color: '#818CF8', border: '1px solid rgba(99,102,241,0.20)', cursor: 'not-allowed' }
    : phase === 'done' ? { background: 'rgba(16,185,129,0.12)', color: '#34D399', border: '1px solid rgba(16,185,129,0.25)' }
    : { background: 'rgba(239,68,68,0.12)', color: '#F87171', border: '1px solid rgba(239,68,68,0.25)' };

  const btnLabel =
    phase === 'idle'       ? 'Generate Report'
    : phase === 'queuing'  ? 'Queuing…'
    : phase === 'generating' ? 'Generating…'
    : phase === 'done'     ? 'Report ready!'
    : 'Error — retry';

  const btnIcon =
    phase === 'idle'        ? <FileBarChart2 size={15} />
    : phase === 'queuing'   ? <Loader2 size={15} className="animate-spin" />
    : phase === 'generating'? <Loader2 size={15} className="animate-spin" />
    : phase === 'done'      ? <CheckCircle size={15} />
    : <AlertCircle size={15} />;

  return (
    <>
      <button
        onClick={trigger}
        disabled={phase !== 'idle' && phase !== 'error'}
        className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all duration-150"
        style={btnStyle}
        onMouseEnter={(e) => {
          if (phase === 'idle') {
            (e.currentTarget as HTMLElement).style.opacity = '0.88';
            (e.currentTarget as HTMLElement).style.transform = 'translateY(-1px)';
            (e.currentTarget as HTMLElement).style.boxShadow = '0 4px 16px rgba(99,102,241,0.35)';
          }
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLElement).style.opacity = '1';
          (e.currentTarget as HTMLElement).style.transform = 'translateY(0)';
          (e.currentTarget as HTMLElement).style.boxShadow = 'none';
        }}
      >
        {btnIcon}
        {btnLabel}
      </button>

      {/* ── Generating banner ── */}
      {(phase === 'generating' || phase === 'done') && (
        <div
          className="fixed bottom-6 right-6 z-50 w-80 rounded-2xl overflow-hidden shadow-2xl"
          style={{
            background: '#0B1120',
            border: '1px solid rgba(99,102,241,0.22)',
            boxShadow: '0 20px 60px rgba(0,0,0,0.6), 0 0 0 1px rgba(99,102,241,0.12)',
          }}
        >
          {/* Progress bar */}
          <div className="h-0.5 w-full" style={{ background: 'rgba(99,102,241,0.10)' }}>
            <div
              className="h-full transition-all duration-300"
              style={{
                width: `${progress}%`,
                background: phase === 'done'
                  ? 'linear-gradient(90deg,#10B981,#34D399)'
                  : 'linear-gradient(90deg,#6366F1,#8B5CF6,#A78BFA)',
                boxShadow: phase === 'done'
                  ? '0 0 8px rgba(16,185,129,0.5)'
                  : '0 0 8px rgba(99,102,241,0.4)',
              }}
            />
          </div>

          <div className="px-4 py-4">
            {phase === 'generating' ? (
              <div className="flex items-start gap-3">
                {/* Animated icon */}
                <div
                  className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 mt-0.5"
                  style={{ background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.18)' }}
                >
                  <Sparkles size={17} className="animate-pulse" style={{ color: '#818CF8' }} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold" style={{ color: '#E2E8F0' }}>
                    Generating report
                  </p>
                  <p className="text-xs mt-0.5 transition-all duration-500" style={{ color: '#64748B' }}>
                    {GENERATING_STEPS[stepIdx]}
                  </p>
                  {/* Dot pulse */}
                  <div className="flex items-center gap-1 mt-2">
                    {[0, 1, 2].map((i) => (
                      <span
                        key={i}
                        className="w-1.5 h-1.5 rounded-full animate-bounce"
                        style={{
                          background: '#6366F1',
                          animationDelay: `${i * 150}ms`,
                          animationDuration: '1s',
                        }}
                      />
                    ))}
                    <span className="text-[11px] ml-2" style={{ color: '#334155' }}>
                      This takes 20–30 s
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => { clearTimers(); setPhase('idle'); }}
                  className="p-1 rounded-md hover:bg-white/5 transition-colors shrink-0"
                  style={{ color: '#334155' }}
                  title="Dismiss (report will still generate)"
                >
                  <X size={14} />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <div
                  className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                  style={{ background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.20)' }}
                >
                  <CheckCircle size={18} style={{ color: '#10B981' }} />
                </div>
                <div>
                  <p className="text-sm font-semibold" style={{ color: '#E2E8F0' }}>Report ready</p>
                  <p className="text-xs mt-0.5" style={{ color: '#64748B' }}>
                    Your report has been added to the list
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
