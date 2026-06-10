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

interface ThemeEntry {
  name: string;
  count: number;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function DarkTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
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
      <div style={{ color: '#F1F5F9', fontWeight: 600 }}>
        {payload[0].value} mentions
      </div>
    </div>
  );
}

const BAR_COLORS = ['#6366F1', '#818CF8', '#8B5CF6', '#A78BFA', '#06B6D4', '#22D3EE'];

export default function ThemesChart({ data }: { data: ThemeEntry[] }) {
  if (data.length === 0) return null;

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
        Themes
      </h2>
      <ResponsiveContainer width="100%" height={Math.max(160, data.length * 36)}>
        <BarChart data={data} layout="vertical" margin={{ left: 4, right: 16, top: 0, bottom: 0 }}>
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="rgba(148,163,184,0.07)"
            horizontal={false}
          />
          <XAxis
            type="number"
            tick={{ fill: '#475569', fontSize: 11 }}
            axisLine={{ stroke: 'rgba(148,163,184,0.10)' }}
            tickLine={false}
          />
          <YAxis
            dataKey="name"
            type="category"
            width={115}
            tick={{ fill: '#94A3B8', fontSize: 12 }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            content={<DarkTooltip />}
            cursor={{ fill: 'rgba(99,102,241,0.05)' }}
          />
          <Bar dataKey="count" radius={[0, 4, 4, 0]}>
            {data.map((_, i) => (
              <Cell key={i} fill={BAR_COLORS[i % BAR_COLORS.length]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
