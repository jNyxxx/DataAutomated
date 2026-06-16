import React from 'react';

// Sparkline — stock-chart style with smooth bezier curves and gradient area fill
export function Sparkline({ points, color, height = 40 }: { points: readonly number[], color: string, height?: number }) {
  if (!points || points.length === 0) return null;

  const w = 120;
  const padY = 4;

  if (points.length === 1) {
    const mid = height / 2;
    return (
      <svg viewBox={`0 0 ${w} ${height}`} preserveAspectRatio="none" className="w-full" style={{ height: `${height}px` }}>
        <line x1="0" y1={mid} x2={w} y2={mid} stroke={color} strokeWidth="1.5" strokeOpacity="0.4" />
        <circle cx={w} cy={mid} r="2.5" fill={color} />
      </svg>
    );
  }

  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max === min ? 0 : max - min;
  const X = (i: number) => (i / (points.length - 1)) * w;
  const Y = (v: number) => {
    if (range === 0) return height / 2;
    return height - padY - ((v - min) / range) * (height - padY * 2);
  };

  const pts = points.map((v, i) => ({ x: X(i), y: Y(v) }));

  // Cubic bezier: control points at the horizontal midpoint keep the curve smooth without overshooting
  let linePath = `M${pts[0].x.toFixed(1)},${pts[0].y.toFixed(1)}`;
  for (let i = 1; i < pts.length; i++) {
    const cpx = ((pts[i - 1].x + pts[i].x) / 2).toFixed(1);
    linePath += ` C${cpx},${pts[i - 1].y.toFixed(1)} ${cpx},${pts[i].y.toFixed(1)} ${pts[i].x.toFixed(1)},${pts[i].y.toFixed(1)}`;
  }

  const last = pts[pts.length - 1];
  const areaPath = `${linePath} L${w},${height} L0,${height} Z`;
  // Use a safe CSS id from the hex color (strip # and non-alphanum)
  const gradId = `sg${color.replace(/[^a-z0-9]/gi, '')}`;

  return (
    <svg viewBox={`0 0 ${w} ${height}`} preserveAspectRatio="none" className="w-full" style={{ height: `${height}px` }}>
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.38" />
          <stop offset="75%" stopColor={color} stopOpacity="0.06" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={`url(#${gradId})`} />
      <path d={linePath} fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={last.x.toFixed(1)} cy={last.y.toFixed(1)} r="2.5" fill={color} />
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
    <div className="space-y-2">
      {steps.map((s, i) => (
        <div key={i} className="flex items-center gap-4">
          <div className="relative h-11 min-w-0 flex-1 overflow-hidden rounded-xl bg-slate-900/60 border border-white/5 shadow-inner">
            <div 
              className={`absolute inset-y-0 left-0 min-w-[44px] rounded-xl ${s.crit ? 'bg-rose-500' : 'bg-blue-500'}`} 
              style={{ width: `${Math.max(2, s.pct)}%` }} 
            />
            <div className="relative flex h-full items-center px-4">
              <span className="truncate text-sm font-semibold text-white drop-shadow-md">{s.l}</span>
            </div>
          </div>
          <span className="w-28 shrink-0 text-right text-sm tabular-nums text-slate-300">{s.pct}% · {s.n}</span>
        </div>
      ))}
    </div>
  );
}
