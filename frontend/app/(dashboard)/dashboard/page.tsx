import { getTokenServerSide } from '@/lib/auth';
import { fetchDashboardSummary } from '@/lib/api';
import { Header } from '@/components/layout/Header';
import { Sparkline, Velocity, FunnelChart } from '@/components/ui/charts';
import { Badge, BADGE_STYLES, DOT_STYLES } from '@/components/ui/badge';
import { Calendar, ChevronDown, Settings, ArrowUpRight, ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';

const TINT = { voc: "#2dd4bf", comp: "#f43f5e", jrn: "#3b82f6", system: "#94a3b8" } as const;

export default async function DashboardPage() {
  const token = getTokenServerSide()!;
  const summary = await fetchDashboardSummary(token).catch(() => null);

  const kpis = [
    { label: "VoC Sentiment", stream: "voc", value: summary?.sentiment_score ? `+${summary.sentiment_score}` : "N/A", delta: "No data", dir: "up", spark: [] },
    { label: "Churn Risk", stream: "voc", value: summary?.churn_risk ? `${Math.round(summary.churn_risk * 100)}%` : "N/A", delta: "No data", dir: "down", spark: [] },
    { label: "New Signals (48h)", stream: "comp", value: summary?.unread_signals?.toString() || "0", delta: "0 critical", dir: "down", spark: [] },
    { label: "Top Funnel Drop", stream: "jrn", value: summary?.latest_drop_off_rate ? `${Math.round(summary.latest_drop_off_rate * 100)}%` : "N/A", delta: summary?.latest_funnel_step || "N/A", dir: "down", spark: [] },
    { label: "Agent Runs (24h)", stream: "system", value: "0", delta: "No data", dir: "up", spark: [] },
  ] as const;

  const attention: any[] = [];

  const SU: Record<string, [string, keyof typeof BADGE_STYLES]> = { critical: ["CRIT", "critical"], high: ["HIGH", "high"], med: ["MED", "warning"], low: ["LOW", "neutral"] };
  const SL: Record<string, string> = { voc: "VoC", comp: "Competitive", jrn: "Journey", system: "System" };
  const RB: Record<string, [string, keyof typeof BADGE_STYLES]> = { ok: ["OK", "success"], running: ["SYNCING", "info"], error: ["ERROR", "critical"] };
  const runs: any[] = [];
  
  const SB: Record<string, [string, keyof typeof BADGE_STYLES]> = { ok: ["OK", "success"], syncing: ["SYNCING", "info"], stale: ["STALE", "warning"], error: ["ERROR", "critical"], off: ["OFF", "neutral"] };
  const sources: any[] = [];
  
  const funnel: any[] = [];

  const dateMenu = (
    <div className="relative">
      <button className="flex h-9 items-center gap-2 rounded-lg bg-slate-950/50 px-3 text-sm text-slate-200 ring-1 ring-inset ring-slate-800 hover:ring-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
        <Calendar className="size-4 text-slate-500" />
        <span>Last 30 days</span>
        <ChevronDown className="size-4 text-slate-500" />
      </button>
    </div>
  );

  return (
    <div className="pb-12">
      <Header
        title="Dashboard"
        description="Acme SaaS Inc. · all data live"
        actions={dateMenu}
      />

      {/* KPI row */}
      <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {kpis.map((k, i) => (
          <section key={i} className="rounded-xl bg-slate-800 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)] p-4">
            <div className="flex items-center gap-2">
              <span className={`size-2 shrink-0 rounded-full ${DOT_STYLES[k.stream as keyof typeof DOT_STYLES]}`}></span>
              <span className="truncate text-xs text-slate-400">{k.label}</span>
            </div>
            <div className="mt-2 text-2xl font-semibold tabular-nums text-white">{k.value}</div>
            <div className={`mt-0.5 truncate text-xs ${k.dir === "up" ? "text-emerald-400" : "text-rose-400"}`}>
              {k.dir === "up" ? "▲" : "▼"} {k.delta}
            </div>
            <div className="mt-3">
              <Sparkline points={k.spark} color={TINT[k.stream as keyof typeof TINT]} height={36} />
            </div>
          </section>
        ))}
      </div>

      {/* Needs attention */}
      <section className="mt-5 rounded-xl bg-slate-800 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)] p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="truncate text-sm font-semibold text-white">Needs attention</h2>
            <p className="truncate text-xs text-slate-400">Urgent items across all streams</p>
          </div>
          <Button variant="ghost">View queue (5) <ArrowRight className="size-4 ml-1" /></Button>
        </div>
        <ul className="space-y-2">
          {attention.length === 0 ? (
            <li className="py-6 text-center text-sm text-slate-400">
              No urgent items currently.
            </li>
          ) : attention.map((a, i) => (
            <li key={i}>
              <button className="flex w-full items-center gap-3 rounded-lg bg-slate-900/50 p-3 text-left transition-colors hover:bg-slate-900/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
                <div className="flex shrink-0 items-center gap-2">
                  <Badge variant={a.stream as keyof typeof BADGE_STYLES} dot>{SL[a.stream]}</Badge>
                  <Badge variant={SU[a.su]?.[1] || "neutral"} dot>{SU[a.su]?.[0] || "Unknown"}</Badge>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-100">{a.title}</p>
                  <p className="line-clamp-1 text-xs text-slate-400">{a.meta.join(" · ")}</p>
                </div>
                <ArrowRight className="size-4 shrink-0 text-slate-500" />
              </button>
            </li>
          ))}
        </ul>
      </section>

      {/* Intelligence streams */}
      <div className="mt-5 grid grid-cols-1 gap-4 xl:grid-cols-2">
        <section className="rounded-xl bg-slate-800 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)] p-5 flex flex-col">
          <div className="mb-4 flex items-center justify-between gap-3">
            <Badge variant="voc" dot>Voice of Customer</Badge>
            <Link href="/insights" className="inline-flex items-center gap-1 rounded text-xs font-medium text-slate-400 hover:text-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">Open <ArrowUpRight className="size-3" /></Link>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-semibold tabular-nums text-white">+0.42</span>
            <span className="text-xs text-teal-400">▲ 0.08</span>
            <span className="ml-auto truncate text-xs text-slate-400">Sentiment · 30d</span>
          </div>
          <div className="mt-3 flex-1">
            <Sparkline points={[3, 4, 3, 5, 4, 6, 6, 7]} color={TINT.voc} height={48} />
          </div>
          <p className="mt-3 truncate text-sm text-slate-400">Top theme: <span className="text-slate-200">Pricing clarity</span></p>
        </section>

        <section className="rounded-xl bg-slate-800 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)] p-5 flex flex-col">
          <div className="mb-4 flex items-center justify-between gap-3">
            <Badge variant="comp" dot>Competitive</Badge>
            <Link href="/signals" className="inline-flex items-center gap-1 rounded text-xs font-medium text-slate-400 hover:text-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">Open <ArrowUpRight className="size-3" /></Link>
          </div>
          <div className="flex items-center gap-4">
            <div><div className="text-2xl font-semibold tabular-nums text-rose-400">0</div><div className="truncate text-xs text-slate-400">critical open</div></div>
            <div><div className="text-2xl font-semibold tabular-nums text-white">0</div><div className="truncate text-xs text-slate-400">signals · 7d</div></div>
          </div>
          <div className="mt-3 flex-1">
            <Velocity data={[]} color={TINT.comp} />
          </div>
          <p className="mt-3 truncate text-sm text-slate-400">Top competitor: <span className="text-slate-200">N/A</span></p>
        </section>

        <section className="rounded-xl bg-slate-800 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)] p-5 xl:col-span-2">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <Badge variant="jrn" dot>Journey Intelligence</Badge>
            <p className="truncate text-sm text-slate-400">Top funnel drop: <span className="font-medium text-slate-200">{summary?.latest_funnel_step || "N/A"}</span> <span className="font-semibold text-rose-400">{summary?.latest_drop_off_rate ? `${Math.round(summary.latest_drop_off_rate * 100)}%` : "N/A"}</span></p>
            <Link href="/journeys" className="inline-flex items-center gap-1 rounded text-xs font-medium text-slate-400 hover:text-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">Open <ArrowUpRight className="size-3" /></Link>
          </div>
          <FunnelChart steps={funnel} />
        </section>
      </div>

      {/* System health */}
      <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <section className="rounded-xl bg-slate-800 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)] p-5">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="truncate text-sm font-semibold text-white">Agent runs</h2>
            <span className="shrink-0 text-xs text-slate-400">last 24h</span>
          </div>
          <ul className="divide-y divide-white/5">
            {runs.length === 0 ? (
              <li className="py-6 text-center text-sm text-slate-400">No agent runs recorded.</li>
            ) : runs.map((r, i) => (
              <li key={i} className="flex items-center gap-3 py-2.5 text-sm">
                <span className="min-w-0 flex-1 truncate text-slate-200">{r[0]}</span>
                <span className="shrink-0 text-xs text-slate-400">{r[2]}</span>
                <Badge variant={RB[r[1]]?.[1] || "neutral"} dot>{RB[r[1]]?.[0] || "Unknown"}</Badge>
              </li>
            ))}
          </ul>
        </section>
        
        <section className="rounded-xl bg-slate-800 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)] p-5">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="truncate text-sm font-semibold text-white">Source health</h2>
            <Button variant="ghost" asChild><Link href="/settings"><Settings className="size-4 mr-2" /> Manage</Link></Button>
          </div>
          <ul className="divide-y divide-white/5">
            {sources.length === 0 ? (
              <li className="py-6 text-center text-sm text-slate-400">No sources configured.</li>
            ) : sources.map((s, i) => (
              <li key={i} className="flex items-center gap-3 py-2.5 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-slate-200">{s[0]}</p>
                  <p className="truncate text-xs text-slate-400">{s[2]}</p>
                </div>
                <Badge variant={SB[s[1]]?.[1] || "neutral"} dot>{SB[s[1]]?.[0] || "Unknown"}</Badge>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
