import { getTokenServerSide } from '@/lib/auth';
import { fetchJourneys } from '@/lib/api';
import { Header } from '@/components/layout/Header';
import { FunnelChart } from '@/components/ui/charts';
import { Badge, BADGE_STYLES } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

export default async function JourneysPage() {
  const token = getTokenServerSide()!;
  const data = await fetchJourneys(token, { limit: 20 }).catch(() => ({ insights: [], total: 0 }));
  const latestInsight = data.insights[0];

  const funnel: any[] = [];
  const devices: any[] = [];

  const recs = data.insights.map(i => {
    const lift = typeof i.projected_lift === 'number' ? i.projected_lift : Number(i.projected_lift) || 0;
    return [
      i.recommendation || "Unknown recommendation",
      i.friction_cause || "unknown",
      "med", // default confidence
      `+${lift.toFixed(1)}%`
    ];
  });

  const CB: Record<string, [string, keyof typeof BADGE_STYLES]> = { high: ["High", "success"], med: ["Medium", "warning"], low: ["Low", "neutral"] };
  const rcv = (t: string): keyof typeof BADGE_STYLES => t === "ux_friction" ? "high" : t === "messaging" ? "info" : "warning";

  return (
    <div className="pb-12">
      <Header
        title="Journey Intelligence"
        description="Activation funnel · Acme SaaS Inc."
      />

      {/* AI Friction Diagnosis */}
      <section className="mt-5 w-full rounded-xl bg-slate-800 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)] p-5 sm:p-6">
        <div className="mb-3 flex items-center gap-2 text-xs font-medium text-blue-400">✦ AI Friction Diagnosis</div>
        <p className="max-w-4xl text-sm leading-relaxed text-slate-300">
          {latestInsight?.recommendation ? (
            <span className="text-white">{latestInsight.recommendation}</span>
          ) : (
            <span className="text-slate-500 italic">No AI diagnosis generated yet. Waiting for enough funnel events...</span>
          )}
        </p>
        <dl className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div>
            <dt className="truncate text-xs text-slate-400">Root cause</dt>
            <dd className="mt-1"><Badge variant="high" dot>ux_friction</Badge></dd>
          </div>
          <div>
            <dt className="truncate text-xs text-slate-400">Friction score</dt>
            <dd className="mt-1 text-lg font-semibold tabular-nums text-white">0.81</dd>
          </div>
          <div>
            <dt className="truncate text-xs text-slate-400">Revenue at risk</dt>
            <dd className="mt-1 text-lg font-semibold tabular-nums text-rose-400">$28K/mo</dd>
          </div>
          <div>
            <dt className="truncate text-xs text-slate-400">Affected sessions</dt>
            <dd className="mt-1 text-lg font-semibold tabular-nums text-white">3,084</dd>
          </div>
        </dl>
      </section>

      {/* Funnel + device */}
      <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-3">
        <section className="rounded-xl bg-slate-800 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)] p-5 lg:col-span-2">
          <div className="mb-4 flex items-baseline justify-between gap-3">
            <h2 className="truncate text-sm font-semibold text-white">Activation funnel</h2>
            <span className="shrink-0 text-xs text-slate-400">drop-off by step · 30d</span>
          </div>
          <FunnelChart steps={funnel} />
        </section>
        
        <section className="rounded-xl bg-slate-800 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)] p-5">
          <div className="mb-4 flex items-baseline justify-between gap-3">
            <h2 className="truncate text-sm font-semibold text-white">Drop-off by device</h2>
            <span className="shrink-0 text-xs text-slate-400">30d</span>
          </div>
          <ul className="space-y-4">
            {devices.map((d, i) => (
              <li key={i}>
                <div className="mb-1.5 flex items-center justify-between gap-3 text-sm">
                  <span className="truncate text-slate-300">{d[0]}</span>
                  <span className="font-medium tabular-nums text-slate-200">{d[1]}%</span>
                </div>
                <div className="h-2.5 overflow-hidden rounded-full bg-slate-700/60">
                  <div className="h-full rounded-full bg-blue-500/80" style={{ width: `${d[1]}%` }}></div>
                </div>
              </li>
            ))}
          </ul>
        </section>
      </div>

      {/* Recommended actions */}
      <section className="mt-5 w-full rounded-xl bg-slate-800 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)] p-5">
        <div className="mb-4">
          <h2 className="truncate text-sm font-semibold text-white">Recommended actions</h2>
          <p className="truncate text-xs text-slate-400">prioritized by projected lift</p>
        </div>
        <div className="-mx-2 overflow-x-auto px-2">
          <table className="w-full min-w-[640px] border-separate border-spacing-0 text-sm">
            <thead>
              <tr className="text-left text-xs font-medium uppercase tracking-wider text-slate-400">
                <th className="px-3 py-2 font-medium">Recommendation</th>
                <th className="px-3 py-2 font-medium">Root cause</th>
                <th className="px-3 py-2 font-medium">Confidence</th>
                <th className="px-3 py-2 text-right font-medium">Projected lift</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody className="[&>tr]:border-t [&>tr]:border-white/5">
              {recs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-sm text-slate-400">No recommended actions available.</td>
                </tr>
              ) : recs.map((r, i) => (
                <tr key={i} className="hover:bg-slate-700/30">
                  <td className="max-w-[320px] px-3 py-3"><span className="block truncate font-medium text-slate-100">{r[0]}</span></td>
                  <td className="px-3 py-3"><Badge variant={rcv(r[1])} dot>{r[1]}</Badge></td>
                  <td className="px-3 py-3"><Badge variant={CB[r[2]]?.[1] || "neutral"} dot>{CB[r[2]]?.[0] || "Unknown"}</Badge></td>
                  <td className="px-3 py-3 text-right"><span className="font-semibold tabular-nums text-emerald-400">{r[3]}</span></td>
                  <td className="px-3 py-3 text-right">
                    <Button variant="outline">Plan fix</Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* EmptyState */}
      {data.insights.length === 0 && (
        <div className="mt-5">
          <div className="flex flex-col items-center justify-center rounded-xl bg-slate-800 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)] px-6 py-10 text-center">
            <span className="grid size-10 place-items-center rounded-full bg-slate-700/50 text-slate-400">▢</span>
            <h3 className="mt-3 text-sm font-medium text-slate-200">No segment data yet</h3>
            <p className="mt-1 max-w-sm text-sm leading-relaxed text-slate-400">Connect a behavioral source (Mixpanel or Segment) to break this funnel down by cohort.</p>
            <Button variant="primary" className="mt-4" asChild><Link href="/settings">Connect a source</Link></Button>
          </div>
        </div>
      )}
    </div>
  );
}
