import { getTokenServerSide } from '@/lib/auth';
import { fetchSignals } from '@/lib/api';
import { Header } from '@/components/layout/Header';
import { Velocity } from '@/components/ui/charts';
import { Badge, BADGE_STYLES } from '@/components/ui/badge';
import { SearchWell } from '@/components/ui/search-well';
import { FilterWell } from '@/components/ui/filter-well';
import { Button } from '@/components/ui/button';
import { Share, Check } from 'lucide-react';

const TINT = { voc: "#2dd4bf", comp: "#f43f5e", jrn: "#3b82f6", system: "#94a3b8" } as const;

export default async function SignalsPage() {
  const token = getTokenServerSide()!;
  const data = await fetchSignals(token, { limit: 20 }).catch(() => ({ signals: [], total: 0 }));

  const sigs = data.signals.map(s => ({
    comp: s.competitor_name,
    cat: s.signal_type || "update",
    su: s.urgency === "medium" ? "med" : s.urgency,
    title: s.signal_type.replace(/_/g, ' '),
    ctx: s.strategic_context,
    src: s.signal_source || "signal",
    when: "recently"
  }));

  const SU: Record<string, [string, keyof typeof BADGE_STYLES]> = { critical: ["Critical", "critical"], high: ["High", "high"], med: ["Medium", "warning"], low: ["Low", "neutral"] };
  const tracked: any[] = [];

  return (
    <div className="pb-12">
      <Header
        title="Competitive Signals"
        description="Tracking 4 competitors · Acme SaaS Inc."
      />



      <div className="mt-5 grid grid-cols-1 gap-5 xl:grid-cols-4">
        <div className="flex flex-col gap-4 xl:col-span-3">
          {sigs.length === 0 ? (
            <div className="rounded-xl border border-dashed border-white/10 p-8 text-center bg-slate-800/30">
              <p className="text-sm text-slate-400">No active signals found.</p>
            </div>
          ) : sigs.map((s, i) => (
            <article key={i} className={`rounded-xl p-5 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)] transition-colors duration-200 ease-out ${s.su === "critical" ? "bg-rose-500/5" : "bg-slate-800"}`}>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={SU[s.su]?.[1] || "neutral"} dot>{SU[s.su]?.[0] || "Unknown"}</Badge>
                <Badge variant="neutral">{s.cat}</Badge>
                <span className="ml-auto flex min-w-0 items-center gap-2 text-xs text-slate-400">
                  <Badge variant="neutral">{s.src}</Badge>
                  <span className="truncate">{s.when}</span>
                </span>
              </div>
              <h3 className="mt-3 line-clamp-2 text-base font-semibold text-white">
                <span className="text-slate-300">{s.comp}</span> — {s.title}
              </h3>
              <div className="mt-3 rounded-lg bg-slate-900/50 p-3.5">
                <div className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-blue-400">✦ Strategic context</div>
                <p className="line-clamp-3 text-sm font-normal leading-relaxed text-slate-300">{s.ctx}</p>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button variant="outline"><Check className="size-4 mr-2" /> Mark read</Button>
                <Button variant="ghost"><Share className="size-4 mr-2" /> Share to Slack</Button>
              </div>
            </article>
          ))}
        </div>

        <div className="flex flex-col gap-5 xl:col-span-1">
          <section className="rounded-xl bg-slate-800 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)] p-5">
            <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-blue-400">✦ Strategic context</div>
            <p className="line-clamp-3 text-sm leading-relaxed text-slate-300">Tracking systems are waiting for initial data ingestion to synthesize signals.</p>
            <dl className="mt-3 divide-y divide-white/5">
              <div className="flex items-center justify-between gap-3 py-2 text-sm">
                <dt className="truncate text-slate-400">Signals (7d)</dt>
                <dd className="font-medium tabular-nums text-slate-200">{sigs.length}</dd>
              </div>
            </dl>
          </section>

          <section className="rounded-xl bg-slate-800 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)] p-5">
            <div className="mb-3 flex items-baseline justify-between gap-3">
              <h2 className="truncate text-sm font-semibold text-white">Signal velocity</h2>
              <span className="shrink-0 text-xs text-slate-400">per day</span>
            </div>
            <Velocity data={[]} color="#3b82f6" />
          </section>

          <section className="rounded-xl bg-slate-800 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)] p-5">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="truncate text-sm font-semibold text-white">Tracked competitors</h2>
              <button className="inline-flex items-center gap-1 rounded text-xs font-medium text-blue-400 transition-[transform,colors] duration-200 ease-out active:scale-95 hover:text-blue-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">+ Add</button>
            </div>
            <ul className="divide-y divide-white/5">
              {tracked.length === 0 ? (
                <li className="py-2 text-sm text-slate-500">No tracked competitors yet.</li>
              ) : tracked.map((t, i) => (
                <li key={i} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <span className="truncate text-slate-200">{t[0]}</span>
                  <Badge variant="neutral">{t[1]} signals</Badge>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}
