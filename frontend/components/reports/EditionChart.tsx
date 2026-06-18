"use client";

import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export function EditionChart({ data }: { data: { day: string; signals: number }[] }) {
  return (
    <div className="h-28 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
          <defs>
            <linearGradient id="editionFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.35} />
              <stop offset="100%" stopColor="#3b82f6" stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis
            dataKey="day"
            tickLine={false}
            axisLine={false}
            tick={{ fill: "#94a3b8", fontSize: 11 }}
            interval="preserveStartEnd"
          />
          <YAxis hide domain={[0, "dataMax + 2"]} />
          <Tooltip
            cursor={{ stroke: "#334155", strokeWidth: 1 }}
            content={({ active, payload, label }) => {
              if (active && payload && payload.length) {
                return (
                  <div className="rounded-lg border border-white/10 bg-slate-900 p-2 text-xs shadow-xl z-50">
                    <p className="font-semibold text-slate-200 mb-1">{label}</p>
                    <div className="flex items-center gap-2">
                      <span className="text-slate-400">Signals:</span>
                      <span className="font-medium text-slate-200">{payload[0].value}</span>
                    </div>
                  </div>
                );
              }
              return null;
            }}
          />
          <Area
            type="monotone"
            dataKey="signals"
            stroke="#3b82f6"
            strokeWidth={2}
            fill="url(#editionFill)"
            dot={false}
            activeDot={{ r: 3, fill: "#3b82f6" }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
