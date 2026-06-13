"use client";

import {
  Bar,
  BarChart,
  Cell,
  LabelList,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from "recharts";
import type { FunnelStep } from "@/lib/api";

/**
 * Flat vertical funnel. Solid bars over a muted track — no nested pills,
 * no secondary borders. Step name + "pct · count" overlay via <LabelList>.
 */
export function FunnelChart({ steps }: { steps: FunnelStep[] }) {
  const data = steps.map((s) => ({
    ...s,
    summary: `${s.pct}% · ${s.count.toLocaleString()}`,
  }));
  const height = Math.max(180, data.length * 56);

  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          layout="vertical"
          data={data}
          margin={{ top: 4, right: 104, bottom: 4, left: 8 }}
          barCategoryGap={12}
        >
          <XAxis type="number" domain={[0, 100]} hide />
          <YAxis type="category" dataKey="label" hide />
          <Bar
            dataKey="pct"
            radius={6}
            background={{ fill: "#1e293b", radius: 6 }}
            isAnimationActive={false}
          >
            {data.map((d) => (
              <Cell
                key={d.id}
                fill={d.critical ? "#f43f5e" : "#3b82f6"}
                fillOpacity={0.8}
              />
            ))}
            <LabelList
              dataKey="label"
              position="insideLeft"
              fill="#ffffff"
              fontSize={13}
              fontWeight={600}
              offset={12}
              // Overflow guard: SVG labels can't truncate via CSS, so clamp
              // dynamic step names before they overrun the bar.
              formatter={(value: string) =>
                value && value.length > 24 ? `${value.slice(0, 23)}…` : value
              }
            />
            <LabelList
              dataKey="summary"
              position="right"
              fill="#94a3b8"
              fontSize={12}
              offset={10}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
