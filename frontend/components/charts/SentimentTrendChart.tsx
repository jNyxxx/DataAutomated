'use client';

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { format } from 'date-fns';

interface DataPoint {
  date: string;
  sentiment: number;
}

interface SentimentTrendChartProps {
  data: DataPoint[];
  height?: number;
}

export function SentimentTrendChart({ data, height = 200 }: SentimentTrendChartProps) {
  if (data.length === 0) {
    return (
      <div
        className="flex items-center justify-center text-muted-foreground text-sm"
        style={{ height }}
      >
        No sentiment data available
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
        <XAxis
          dataKey="date"
          tickFormatter={(v: string) => format(new Date(v), 'MMM d')}
          tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          domain={[-1, 1]}
          tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }}
          tickFormatter={(v: number) => `${(v * 100).toFixed(0)}%`}
          axisLine={false}
          tickLine={false}
          width={40}
        />
        <Tooltip
          cursor={{ stroke: "#334155", strokeWidth: 1 }}
          content={({ active, payload, label }) => {
            if (active && payload && payload.length) {
              return (
                <div className="rounded-lg border border-white/10 bg-slate-900 p-2 text-xs shadow-xl z-50">
                  <p className="font-semibold text-slate-200 mb-1">{format(new Date(label), 'MMM d, yyyy')}</p>
                  <div className="flex items-center gap-2">
                    <span className="text-slate-400">Sentiment:</span>
                    <span className="font-medium text-slate-200">{(Number(payload[0].value) * 100).toFixed(1)}%</span>
                  </div>
                </div>
              );
            }
            return null;
          }}
        />
        <Line
          type="monotone"
          dataKey="sentiment"
          stroke="hsl(var(--primary))"
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4, strokeWidth: 0 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
