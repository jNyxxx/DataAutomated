import React from 'react';

// Sparkline
export function Sparkline({ points, color, height = 40 }: { points: readonly number[], color: string, height?: number }) {
  if (!points || points.length === 0) return null;
  const w = 120;
  const max = Math.max(...points, 1);
  const min = Math.min(...points);
  
  const X = (i: number) => i * (w / (Math.max(points.length - 1, 1)));
  const Y = (v: number) => height - 3 - ((v - min) / ((max - min) || 1)) * (height - 6);
  
  const d = points.map((v, i) => (i ? 'L' : 'M') + X(i).toFixed(1) + ' ' + Y(v).toFixed(1)).join(' ');
  
  return (
    <svg viewBox={`0 0 ${w} ${height}`} preserveAspectRatio="none" className="w-full" style={{ height: `${height}px` }}>
      <path d={`${d} L${w} ${height} L0 ${height} Z`} fill={color} fillOpacity="0.14" />
      <path d={d} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// Velocity Bar
export function Velocity({ data, color }: { data: readonly { day: string, count: number }[], color: string }) {
  const w = 240, h = 96, pad = 18;
  const max = Math.max(...data.map(d => d.count), 1) * 1.15;
  const bw = (w - pad * 2) / Math.max(data.length, 1);
  
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full" style={{ height: `${h}px` }}>
      {data.map((d, i) => {
        const bh = (d.count / max) * (h - pad * 2);
        const x = pad + i * bw + bw * 0.18;
        const y = h - pad - bh;
        const ww = bw * 0.64;
        return (
          <g key={i}>
            <rect x={x.toFixed(1)} y={y.toFixed(1)} width={ww.toFixed(1)} height={bh.toFixed(1)} rx="3" fill={color} fillOpacity="0.8" />
            <text x={(x + ww / 2).toFixed(1)} y={h - 5} textAnchor="middle" fill="#94a3b8" fontSize="10">{d.day}</text>
          </g>
        );
      })}
    </svg>
  );
}

// Donut
export function Donut({ segments }: { segments: readonly { v: number, color: string }[] }) {
  const r = 38, c = 2 * Math.PI * r;
  let acc = 0;
  return (
    <svg viewBox="0 0 100 100" className="size-28">
      {segments.map((s, i) => {
        const frac = s.v / 100;
        const dash = frac * c;
        const offset = -acc;
        acc += dash;
        return (
          <circle key={i} cx="50" cy="50" r={r} fill="none" stroke={s.color} strokeWidth="16" strokeDasharray={`${dash.toFixed(1)} ${(c - dash).toFixed(1)}`} strokeDashoffset={offset.toFixed(1)} transform="rotate(-90 50 50)" />
        );
      })}
    </svg>
  );
}

// Gauge
export function Gauge({ value, color }: { value: number, color: string }) {
  const r = 46, c = Math.PI * r, off = c * (1 - value);
  return (
    <svg viewBox="0 0 112 70" className="w-full" style={{ height: '96px' }}>
      <path d={`M10 60 A46 46 0 0 1 102 60`} fill="none" stroke="#334155" strokeWidth="10" strokeLinecap="round" />
      <path d={`M10 60 A46 46 0 0 1 102 60`} fill="none" stroke={color} strokeWidth="10" strokeLinecap="round" strokeDasharray={c.toFixed(1)} strokeDashoffset={off.toFixed(1)} />
    </svg>
  );
}

// Funnel Chart
export function FunnelChart({ steps }: { steps: readonly { l: string, pct: number, n: string | number, crit?: boolean }[] }) {
  return (
    <div className="space-y-3">
      {steps.map((s, i) => (
        <div key={i} className="flex items-center gap-3">
          <div className="relative h-9 min-w-0 flex-1 overflow-hidden rounded-md bg-slate-900/60">
            <div className={`absolute inset-y-0 left-0 rounded-md ${s.crit ? 'bg-rose-500/80' : 'bg-blue-500/80'}`} style={{ width: `${Math.max(4, s.pct)}%` }} />
            <div className="relative flex h-full items-center px-3">
              <span className="truncate text-[13px] font-semibold text-white">{s.l}</span>
            </div>
          </div>
          <span className="w-32 shrink-0 text-right text-xs tabular-nums text-slate-400">{s.pct}% · {s.n}</span>
        </div>
      ))}
    </div>
  );
}
