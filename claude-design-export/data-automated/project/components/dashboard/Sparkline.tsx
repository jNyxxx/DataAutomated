"use client";

import { Area, AreaChart, ResponsiveContainer } from "recharts";
import type { Stream } from "@/lib/api";

const TINT: Record<Stream, string> = {
  voc: "#2dd4bf",
  comp: "#f43f5e",
  jrn: "#3b82f6",
  system: "#94a3b8",
};

/** Flat, axis-less sparkline for KPI cards and stream previews. */
export function Sparkline({
  points,
  stream = "jrn",
  height = 40,
}: {
  points: number[];
  stream?: Stream;
  height?: number;
}) {
  const data = points.map((v, i) => ({ i, v }));
  const color = TINT[stream];
  const gid = `spark-${stream}`;

  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 3, right: 0, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.3} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <Area
            type="monotone"
            dataKey="v"
            stroke={color}
            strokeWidth={2}
            fill={`url(#${gid})`}
            dot={false}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
