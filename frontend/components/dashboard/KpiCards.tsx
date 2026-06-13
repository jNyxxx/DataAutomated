import { Sparkline } from "@/components/dashboard/Sparkline";
import type { Kpi } from "@/lib/api";

const DOT: Record<string, string> = {
  voc: "bg-teal-400",
  comp: "bg-rose-400",
  jrn: "bg-blue-400",
  system: "bg-slate-400",
};

export function KpiCards({ kpis }: { kpis: Kpi[] }) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
      {kpis.map((k) => (
        <section key={k.id} className="rounded-xl bg-slate-800 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)] p-4">
          <div className="flex items-center gap-2">
            <span className={`size-2 shrink-0 rounded-full ${DOT[k.stream] ?? DOT.system}`} />
            <span className="truncate text-xs text-slate-400">{k.label}</span>
          </div>
          <div className="mt-2 text-2xl font-semibold tabular-nums text-white">{k.value}</div>
          <div
            className={`mt-0.5 truncate text-xs ${
              k.direction === "up" ? "text-emerald-400" : "text-rose-400"
            }`}
          >
            {k.direction === "up" ? "▲" : "▼"} {k.delta}
          </div>
          <div className="mt-3">
            <Sparkline points={k.spark} stream={k.stream} height={36} />
          </div>
        </section>
      ))}
    </div>
  );
}
