'use client';

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

interface DataPoint {
  step: string;
  drop_off_rate: number;
}

interface FunnelDropOffChartProps {
  data: DataPoint[];
  height?: number;
}

export function FunnelDropOffChart({ data, height = 200 }: FunnelDropOffChartProps) {
  if (data.length === 0) {
    return (
      <div
        className="flex items-center justify-center text-muted-foreground text-sm"
        style={{ height }}
      >
        No journey data available
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
        <XAxis
          dataKey="step"
          tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }}
          tickFormatter={(v: string) => v.replace(/_/g, ' ')}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tickFormatter={(v: number) => `${(v * 100).toFixed(0)}%`}
          tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          width={36}
        />
        <Tooltip
          contentStyle={{
            background: 'hsl(var(--card))',
            border: '1px solid hsl(var(--border))',
            borderRadius: '6px',
            fontSize: '12px',
          }}
          formatter={(v: number) => [`${(v * 100).toFixed(1)}%`, 'Drop-off Rate']}
          cursor={{ fill: 'hsl(var(--muted)/0.3)' }}
        />
        <Bar
          dataKey="drop_off_rate"
          fill="hsl(var(--destructive))"
          radius={[4, 4, 0, 0]}
          maxBarSize={64}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}
