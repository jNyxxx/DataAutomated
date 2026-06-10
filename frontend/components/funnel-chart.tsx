'use client';

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Cell,
} from 'recharts';

interface FunnelEntry {
  step: string;
  dropOff: number;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function DarkTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const value = payload[0].value as number;
  return (
    <div
      style={{
        background: '#1C2840',
        border: '1px solid rgba(148,163,184,0.14)',
        borderRadius: 8,
        padding: '8px 12px',
        boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
        fontSize: 12,
      }}
    >
      <div style={{ color: '#64748B', marginBottom: 3 }}>{label}</div>
      <div
        style={{
          color: value > 30 ? '#F87171' : value > 15 ? '#FBBF24' : '#34D399',
          fontWeight: 600,
        }}
      >
        {value.toFixed(1)}% drop-off
      </div>
    </div>
  );
}

// Color ramp: low drop-off = teal, high = red-orange
function getBarColor(dropOff: number): string {
  if (dropOff > 40) return '#EF4444';
  if (dropOff > 25) return '#F97316';
  if (dropOff > 12) return '#F59E0B';
  return '#06B6D4';
}

export default function FunnelChart({ data }: { data: FunnelEntry[] }) {
  if (data.length <= 1) return null;

  return (
    <div
      className="rounded-xl p-5"
      style={{
        background: '#151E35',
        border: '1px solid rgba(148,163,184,0.09)',
      }}
    >
      <h2
        className="text-sm font-semibold mb-4 uppercase tracking-wide"
        style={{ color: '#64748B' }}
      >
        Funnel Drop-off
      </h2>
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={data} margin={{ left: 0, right: 8, top: 0, bottom: 0 }}>
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="rgba(148,163,184,0.07)"
            vertical={false}
          />
          <XAxis
            dataKey="step"
            tick={{ fill: '#94A3B8', fontSize: 11 }}
            axisLine={{ stroke: 'rgba(148,163,184,0.10)' }}
            tickLine={false}
          />
          <YAxis
            unit="%"
            tick={{ fill: '#475569', fontSize: 11 }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            content={<DarkTooltip />}
            cursor={{ fill: 'rgba(99,102,241,0.05)' }}
          />
          <Bar dataKey="dropOff" radius={[4, 4, 0, 0]}>
            {data.map((entry, i) => (
              <Cell key={i} fill={getBarColor(entry.dropOff)} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
