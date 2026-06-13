"use client";

import {
  Area,
  AreaChart,
  Cell,
  Pie,
  PieChart,
  PolarAngleAxis,
  RadialBar,
  RadialBarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { SentimentMix, SentimentPoint } from "@/lib/api";

const TOOLTIP_STYLE = {
  background: "#0f172a",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: 8,
  fontSize: 12,
  color: "#e2e8f0",
} as const;

/** Sentiment score over time. */
export function SentimentTrendChart({ data }: { data: SentimentPoint[] }) {
  return (
    <div className="h-32 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 6, right: 4, bottom: 0, left: 4 }}>
          <defs>
            <linearGradient id="vocTrendFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#2dd4bf" stopOpacity={0.35} />
              <stop offset="100%" stopColor="#2dd4bf" stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis
            dataKey="day"
            tickLine={false}
            axisLine={false}
            tick={{ fill: "#94a3b8", fontSize: 11 }}
            interval="preserveStartEnd"
          />
          <YAxis hide domain={["dataMin - 0.2", "dataMax + 0.2"]} />
          <Tooltip cursor={{ stroke: "#334155", strokeWidth: 1 }} contentStyle={TOOLTIP_STYLE} labelStyle={{ color: "#94a3b8" }} />
          <Area
            type="monotone"
            dataKey="score"
            stroke="#2dd4bf"
            strokeWidth={2}
            fill="url(#vocTrendFill)"
            dot={false}
            activeDot={{ r: 3, fill: "#2dd4bf" }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Semicircular churn-risk gauge (0–1). */
export function ChurnGauge({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const tint = pct >= 25 ? "#f43f5e" : pct >= 15 ? "#f59e0b" : "#2dd4bf";
  return (
    <div className="relative h-32 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <RadialBarChart
          innerRadius="72%"
          outerRadius="100%"
          startAngle={180}
          endAngle={0}
          data={[{ name: "churn", value: pct }]}
        >
          <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
          <RadialBar background={{ fill: "#334155" }} dataKey="value" cornerRadius={9} fill={tint} />
        </RadialBarChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-x-0 bottom-2 flex flex-col items-center">
        <span className="text-3xl font-semibold tabular-nums text-white">{pct}%</span>
        <span className="text-xs text-slate-400">at-risk accounts</span>
      </div>
    </div>
  );
}

const MIX_COLORS = { positive: "#2dd4bf", negative: "#f43f5e", neutral: "#64748b" } as const;

/** Sentiment split donut + legend. */
export function SentimentDonut({ mix }: { mix: SentimentMix }) {
  const data = [
    { key: "positive", label: "Positive", value: mix.positive },
    { key: "negative", label: "Negative", value: mix.negative },
    { key: "neutral", label: "Neutral", value: mix.neutral },
  ];
  return (
    <div className="flex items-center gap-4">
      <div className="h-28 w-28 shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="label" innerRadius="62%" outerRadius="100%" paddingAngle={2} stroke="none">
              {data.map((d) => (
                <Cell key={d.key} fill={MIX_COLORS[d.key as keyof typeof MIX_COLORS]} />
              ))}
            </Pie>
            <Tooltip contentStyle={TOOLTIP_STYLE} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <ul className="min-w-0 flex-1 space-y-1.5 text-sm">
        {data.map((d) => (
          <li key={d.key} className="flex items-center justify-between gap-3">
            <span className="flex min-w-0 items-center gap-2 text-slate-300">
              <span className="size-2 shrink-0 rounded-full" style={{ background: MIX_COLORS[d.key as keyof typeof MIX_COLORS] }} />
              <span className="truncate">{d.label}</span>
            </span>
            <span className="shrink-0 font-medium tabular-nums text-slate-200">{d.value}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
