import Link from 'next/link';
import { getTokenServerSide, getUserRoleFromToken } from '@/lib/auth';
import { fetchClientInfo, fetchDeviceBreakdown, fetchJourneys } from '@/lib/api';
import { Header } from '@/components/layout/Header';
import { Badge, BADGE_STYLES } from '@/components/ui/badge';
import { Donut, FunnelChart } from '@/components/ui/charts';
import { Button } from '@/components/ui/button';
import { PlanFixButton } from '@/components/journeys/PlanFixButton';
import { AnalyzeJourneyButton } from '@/components/journeys/JourneyActions';

const DEVICE_COLORS = {
  desktop: '#3b82f6',
  mobile: '#2dd4bf',
  tablet: '#f59e0b',
  unknown: '#64748b',
} as const;

export default async function JourneysPage() {
  const token = getTokenServerSide()!;
  const role = getUserRoleFromToken(token);
  const canTrigger = role !== 'viewer';
  const [data, clientInfo, deviceData] = await Promise.all([
    fetchJourneys(token, { limit: 20 }).catch(() => ({ insights: [], total: 0 })),
    fetchClientInfo(token).catch(() => ({ name: 'Your account', plan: 'insight_starter', email: '' })),
    fetchDeviceBreakdown(token, true).catch(() => ({ devices: [] })),
  ]);
  const latestInsight = data.insights[0];

  const funnel = data.insights.slice(0, 8).map((journey) => ({
    l: (journey.funnel_step || 'Step').split('->').map(s => s.trim().replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())).join(' → '),
    pct: Math.max(5, Math.round((1 - (journey.drop_off_rate ?? 0)) * 100)),
    n: `${Math.round((journey.drop_off_rate ?? 0) * 100)}%`,
    crit: (journey.drop_off_rate ?? 0) > 0.4,
  }));

  const recs = data.insights.map((insight) => {
    const lift =
      typeof insight.projected_lift === 'number'
        ? insight.projected_lift
        : Number(insight.projected_lift) || 0;
    return [
      insight.recommendation || 'Unknown recommendation',
      insight.friction_cause || 'unknown',
      `+${lift.toFixed(1)}%`,
    ];
  });

  const rootCauseVariant = (text: string): keyof typeof BADGE_STYLES =>
    text === 'ux_friction' ? 'high' : text === 'messaging' ? 'info' : 'warning';

  return (
    <div className="pb-12">
      <Header
        title="Journey Intelligence"
        description={`Activation funnel - ${clientInfo.name}`}
        actions={<AnalyzeJourneyButton canTrigger={canTrigger} />}
      />

      <section className="mt-5 w-full rounded-xl bg-slate-800 p-5 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)] sm:p-6">
        <div className="mb-3 flex items-center gap-2 text-xs font-medium text-blue-400">AI Friction Diagnosis</div>
        <p className="max-w-4xl text-sm leading-relaxed text-slate-300">
          {latestInsight?.recommendation ? (
            <span className="text-white">{latestInsight.recommendation}</span>
          ) : (
            <span className="italic text-slate-500">No AI diagnosis generated yet. Waiting for enough funnel events...</span>
          )}
        </p>
        <dl className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div>
            <dt className="truncate text-xs text-slate-400">Root cause</dt>
            <dd className="mt-1">
              <Badge
                variant={
                  latestInsight?.friction_cause === 'ux_friction'
                    ? 'high'
                    : latestInsight?.friction_cause === 'messaging'
                      ? 'info'
                      : latestInsight?.friction_cause
                        ? 'warning'
                        : 'neutral'
                }
                dot
              >
                {latestInsight?.friction_cause ?? 'N/A'}
              </Badge>
            </dd>
          </div>
          <div>
            <dt className="truncate text-xs text-slate-400">Friction score</dt>
            <dd className="mt-1 text-lg font-semibold tabular-nums text-white">
              {latestInsight?.friction_score != null ? latestInsight.friction_score.toFixed(2) : 'N/A'}
            </dd>
          </div>
          <div>
            <dt className="truncate text-xs text-slate-400">Projected lift</dt>
            <dd className="mt-1 text-lg font-semibold tabular-nums text-emerald-400">
              {latestInsight?.projected_lift != null ? `+${latestInsight.projected_lift.toFixed(1)}%` : 'N/A'}
            </dd>
          </div>
          <div>
            <dt className="truncate text-xs text-slate-400">Top drop-off step</dt>
            <dd className="mt-1 truncate text-sm font-medium tabular-nums text-white">
              {latestInsight?.funnel_step ?? 'N/A'}
            </dd>
          </div>
        </dl>
      </section>

      <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-3">
        <section className="rounded-xl bg-slate-800 p-5 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)] lg:col-span-2">
          <div className="mb-4 flex items-baseline justify-between gap-3">
            <h2 className="truncate text-sm font-semibold text-white">Activation funnel</h2>
            <span className="shrink-0 text-xs text-slate-400">drop-off by step - 30d</span>
          </div>
          <FunnelChart steps={funnel} />
        </section>

        <section className="rounded-xl bg-slate-800 p-5 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)]">
          <div className="mb-4 flex items-baseline justify-between gap-3">
            <h2 className="truncate text-sm font-semibold text-white">Device breakdown</h2>
            <span className="shrink-0 text-xs text-slate-400">30d</span>
          </div>
          {deviceData.devices.length === 0 ? (
            <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-white/10 py-6 text-center">
              <p className="text-xs text-slate-500">No device data yet.</p>
              <Link
                href="/settings"
                className="inline-flex h-7 items-center rounded-md bg-slate-700 px-2.5 text-xs font-medium text-slate-200 hover:bg-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              >
                Connect Mixpanel or Segment
              </Link>
            </div>
          ) : (
            <div className="flex items-center gap-4">
              <Donut
                segments={deviceData.devices.map((device) => ({
                  v: device.pct,
                  color: DEVICE_COLORS[device.device as keyof typeof DEVICE_COLORS] ?? DEVICE_COLORS.unknown,
                }))}
              />
              <ul className="min-w-0 flex-1 space-y-1.5 text-sm">
                {deviceData.devices.map((device) => (
                  <li key={device.device} className="flex items-center justify-between gap-3">
                    <span className="flex items-center gap-2 text-slate-300">
                      <span
                        className="size-2 rounded-full"
                        style={{ backgroundColor: DEVICE_COLORS[device.device as keyof typeof DEVICE_COLORS] ?? DEVICE_COLORS.unknown }}
                      />
                      {device.device}
                    </span>
                    <span className="font-medium tabular-nums text-slate-200">{device.pct}%</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      </div>

      <section className="mt-5 w-full rounded-xl bg-slate-800 p-5 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)]">
        <div className="mb-4">
          <h2 className="truncate text-sm font-semibold text-white">Recommended actions</h2>
          <p className="truncate text-xs text-slate-400">prioritized by projected lift</p>
        </div>
        <div className="-mx-2 overflow-x-auto px-2">
          <table className="w-full min-w-[560px] border-separate border-spacing-0 text-sm">
            <thead>
              <tr className="text-left text-xs font-medium uppercase tracking-wider text-slate-400">
                <th className="px-3 py-2 font-medium">Recommendation</th>
                <th className="px-3 py-2 font-medium">Root cause</th>
                <th className="px-3 py-2 text-right font-medium">Projected lift</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody className="[&>tr]:border-t [&>tr]:border-white/5">
              {recs.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-6 text-center text-sm text-slate-400">
                    No recommended actions yet.{' '}
                    {canTrigger
                      ? 'Connect a behavioral source and run journey analysis to generate AI recommendations.'
                      : 'Ask an admin to run journey analysis.'}
                  </td>
                </tr>
              ) : (
                recs.map((rec, index) => (
                  <tr key={`${rec[0]}-${index}`} className="hover:bg-slate-700/30">
                    <td className="max-w-[320px] px-3 py-3"><span className="block truncate font-medium text-slate-100">{rec[0]}</span></td>
                    <td className="px-3 py-3"><Badge variant={rootCauseVariant(rec[1])} dot>{rec[1]}</Badge></td>
                    <td className="px-3 py-3 text-right"><span className="font-semibold tabular-nums text-emerald-400">{rec[2]}</span></td>
                    <td className="px-3 py-3 text-right">
                      <PlanFixButton />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {data.insights.length === 0 && (
        <div className="mt-5">
          <div className="flex flex-col items-center justify-center rounded-xl bg-slate-800 px-6 py-10 text-center shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)]">
            <span className="grid size-10 place-items-center rounded-full bg-slate-700/50 text-slate-400">■</span>
            <h3 className="mt-3 text-sm font-medium text-slate-200">No segment data yet</h3>
            <p className="mt-1 max-w-sm text-sm leading-relaxed text-slate-400">Connect a behavioral source (Mixpanel or Segment) to break this funnel down by cohort.</p>
            <Button variant="primary" className="mt-4" asChild><Link href="/settings">Connect a source</Link></Button>
          </div>
        </div>
      )}
    </div>
  );
}
