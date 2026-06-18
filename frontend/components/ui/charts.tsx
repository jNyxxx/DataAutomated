'use client';
import React from 'react';
import { Area, AreaChart, Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

// Sparkline — stock-chart style with smooth bezier curves and gradient area fill
export function Sparkline({ points, data, color, height = 40 }: { points?: number[], data?: { value: number, label: string }[], color: string, height?: number }) {
  const chartData = data ? data : (points || []).map((v, i) => ({ value: v, label: `Point ${i + 1}` }));
  if (!chartData || chartData.length === 0) return null;
  const gradId = `sg${color.replace(/[^a-z0-9]/gi, '')}`;

  return (
    <div style={{ height, width: '100%' }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.5} />
              <stop offset="75%" stopColor={color} stopOpacity={0.1} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis dataKey="label" hide />
          <YAxis domain={['auto', 'auto']} hide />
          <Tooltip
            isAnimationActive={false}
            wrapperStyle={{ zIndex: 1000, pointerEvents: 'none' }}
            cursor={{ stroke: "#334155", strokeWidth: 1 }}
            contentStyle={{
              background: "#0f172a",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 8,
              fontSize: 12,
              color: "#e2e8f0",
            }}
            labelStyle={{ color: "#94a3b8" }}
            formatter={(val: number) => [val, 'Value']}
          />
          <Area
            type="monotone"
            dataKey="value"
            stroke={color}
            strokeWidth={2.5}
            fill={`url(#${gradId})`}
            dot={false}
            activeDot={{ r: 4, fill: '#fff', stroke: color, strokeWidth: 2 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

// Velocity Bar
export function Velocity({ data, color }: { data: { day: string, count: number }[], color: string }) {
  if (!data || data.length === 0) return null;
  const gradId = `vg${color.replace(/[^a-z0-9]/gi, '')}`;
  return (
    <div style={{ height: 96, width: '100%' }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={1} />
              <stop offset="100%" stopColor={color} stopOpacity={0.4} />
            </linearGradient>
          </defs>
          <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fill: "#94a3b8", fontSize: 10 }} dy={5} />
          <YAxis hide />
          <Tooltip
            isAnimationActive={false}
            wrapperStyle={{ zIndex: 1000, pointerEvents: 'none' }}
            cursor={{ fill: 'rgba(255,255,255,0.05)' }}
            contentStyle={{
              background: "#0f172a",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 8,
              fontSize: 12,
              color: "#e2e8f0",
            }}
            labelStyle={{ color: "#94a3b8" }}
            formatter={(val: number) => [val, 'Count']}
          />
          <Bar dataKey="count" radius={[6, 6, 0, 0]} maxBarSize={36}>
            {data.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={`url(#${gradId})`} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
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
        <div key={i} className="flex items-center gap-4 group">
          <div className="relative h-11 min-w-0 flex-1 overflow-hidden rounded-xl bg-slate-900/60 border border-white/5 shadow-inner transition-transform group-hover:scale-[1.01]">
            <div 
              className={`absolute inset-y-0 left-0 min-w-[44px] rounded-xl transition-all duration-1000 ${
                s.crit 
                  ? 'bg-gradient-to-r from-rose-600 to-rose-400 shadow-[0_0_15px_rgba(244,63,94,0.4)]' 
                  : 'bg-gradient-to-r from-blue-600 to-blue-400 shadow-[0_0_15px_rgba(59,130,246,0.4)]'
              }`} 
              style={{ width: `${Math.max(2, s.pct)}%` }} 
            />
            <div className="relative flex h-full items-center px-4">
              <span className="truncate text-sm font-semibold text-white drop-shadow-md">{s.l}</span>
            </div>
          </div>
          <span className="w-28 shrink-0 text-right text-sm font-medium tabular-nums text-slate-400 group-hover:text-slate-200 transition-colors">
            {s.pct}% · {s.n}
          </span>
        </div>
      ))}
    </div>
  );
}
