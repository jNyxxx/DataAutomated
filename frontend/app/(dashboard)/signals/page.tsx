import { formatDistanceToNow } from 'date-fns';
import { getTokenServerSide, getUserRoleFromToken } from '@/lib/auth';
import { fetchClientInfo, fetchSignalOverview, fetchSignals } from '@/lib/api';
import { Header } from '@/components/layout/Header';
import { Velocity } from '@/components/ui/charts';
import { Badge, BADGE_STYLES } from '@/components/ui/badge';
import { AddCompetitorButton, MarkReadButton, RunSignalAnalysisButton } from '@/components/signals/SignalActions';

export default async function SignalsPage() {
  const token = getTokenServerSide()!;
  const role = getUserRoleFromToken(token);
  const canTrigger = role !== 'viewer';
  const [data, overview, clientInfo] = await Promise.all([
    fetchSignals(token, { limit: 20 }).catch(() => ({ signals: [], total: 0 })),
    fetchSignalOverview(token, 'last_14_days').catch(() => ({
      period: 'last_14_days',
      signals_7d: 0,
      tracked_competitors: 0,
      velocity: [] as { day: string; label: string; count: number }[],
      competitors: [] as { name: string; count: number }[],
      latest_context: null,
      share_of_voice: {} as Record<string, Record<string, number>>,
    })),
    fetchClientInfo(token).catch(() => ({ name: 'Your account', plan: 'insight_starter', email: '' })),
  ]);

  const sigs = data.signals.map((signal) => ({
    id: signal.id,
    isRead: signal.is_read,
    comp: signal.competitor_name,
    cat: signal.signal_type || 'update',
    su: signal.urgency === 'medium' ? 'med' : signal.urgency,
    title: signal.signal_type.replace(/_/g, ' '),
    ctx: signal.strategic_context,
    src: signal.signal_source || 'signal',
    when: signal.detected_at
      ? `${formatDistanceToNow(new Date(signal.detected_at))} ago`
      : '-',
  }));

  const velocityData = overview.velocity.map((item) => ({
    day: item.label,
    count: item.count,
  }));
  const strategicContextText = overview.latest_context
    ?? (overview.tracked_competitors > 0
      ? 'Tracked competitors are configured. Connect a live NewsAPI source to generate competitive signals.'
      : 'Tracking systems are waiting for competitor configuration and a live competitive source.');

  const severityBadges: Record<string, [string, keyof typeof BADGE_STYLES]> = {
    critical: ['Critical', 'critical'],
    high: ['High', 'high'],
    med: ['Medium', 'warning'],
    low: ['Low', 'neutral'],
  };

  return (
    <div className="pb-12">
      <Header
        title="Competitive Signals"
        description={`${overview.tracked_competitors} competitor${overview.tracked_competitors !== 1 ? 's' : ''} tracked - ${clientInfo.name}`}
        actions={<RunSignalAnalysisButton canTrigger={canTrigger} />}
      />

      <div className="mt-5 grid grid-cols-1 gap-5 xl:grid-cols-4">
        <div className="flex flex-col gap-4 xl:col-span-3">
          {sigs.length === 0 ? (
            <div className="rounded-xl border border-dashed border-white/10 bg-slate-800/30 p-8 text-center">
              {overview.tracked_competitors === 0 ? (
                <>
                  <p className="text-sm font-medium text-slate-300">No competitors tracked yet</p>
                  <p className="mt-1 text-sm text-slate-500">Add a competitor to start monitoring signals from news, reviews, and social sources.</p>
                  {canTrigger && (
                    <button
                      className="mt-4 inline-flex items-center gap-1 rounded text-sm font-medium text-blue-400 hover:text-blue-300"
                    >
                      + Add competitor in the panel →
                    </button>
                  )}
                </>
              ) : (
                <>
                  <p className="text-sm font-medium text-slate-300">No signals yet</p>
                  <p className="mt-1 text-sm text-slate-500">
                    {overview.tracked_competitors} competitor{overview.tracked_competitors !== 1 ? 's' : ''} tracked — connect a NewsAPI source or run analysis to surface new signals.
                  </p>
                  {canTrigger && (
                    <div className="mt-4 flex justify-center">
                      <RunSignalAnalysisButton canTrigger={canTrigger} />
                    </div>
                  )}
                </>
              )}
            </div>
          ) : (
            sigs.map((signal, index) => (
              <article
                key={`${signal.comp}-${signal.title}-${index}`}
                className={`rounded-xl p-5 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)] transition-colors duration-200 ease-out ${signal.su === 'critical' ? 'bg-rose-500/5' : 'bg-slate-800'}`}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={severityBadges[signal.su]?.[1] || 'neutral'} dot>{severityBadges[signal.su]?.[0] || 'Unknown'}</Badge>
                  <Badge variant="neutral">{signal.cat}</Badge>
                  <span className="ml-auto flex min-w-0 items-center gap-2 text-xs text-slate-400">
                    <Badge variant="neutral">{signal.src}</Badge>
                    <span className="truncate">{signal.when}</span>
                  </span>
                </div>
                <h3 className="mt-3 line-clamp-2 text-base font-semibold text-white">
                  <span className="text-slate-300">{signal.comp}</span> - {signal.title}
                </h3>
                <div className="mt-3 rounded-lg bg-slate-900/50 p-3.5">
                  <div className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-blue-400">Strategic context</div>
                  <p className="line-clamp-3 text-sm font-normal leading-relaxed text-slate-300">{signal.ctx}</p>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <MarkReadButton id={signal.id} isRead={signal.isRead} />
                </div>
              </article>
            ))
          )}
        </div>

        <div className="flex flex-col gap-5 xl:col-span-1">
          <section className="rounded-xl bg-slate-800 p-5 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)]">
            <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-blue-400">Strategic context</div>
            <p className="line-clamp-4 text-sm leading-relaxed text-slate-300">
              {strategicContextText}
            </p>
            <dl className="mt-3 divide-y divide-white/5">
              <div className="flex items-center justify-between gap-3 py-2 text-sm">
                <dt className="truncate text-slate-400">Signals (7d)</dt>
                <dd className="font-medium tabular-nums text-slate-200">{overview.signals_7d}</dd>
              </div>
            </dl>
          </section>

          <section className="rounded-xl bg-slate-800 p-5 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)]">
            <div className="mb-3 flex items-baseline justify-between gap-3">
              <h2 className="truncate text-sm font-semibold text-white">Signal velocity</h2>
              <span className="shrink-0 text-xs text-slate-400">per day</span>
            </div>
            {velocityData.length === 0 ? (
              <div className="rounded-lg border border-dashed border-white/10 py-4 text-center text-xs text-slate-500">
                No signal activity yet.
              </div>
            ) : (
              <Velocity data={velocityData} color="#3b82f6" />
            )}
          </section>

          <section className="rounded-xl bg-slate-800 p-5 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)]">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="truncate text-sm font-semibold text-white">Tracked competitors</h2>
              <AddCompetitorButton canTrigger={canTrigger} />
            </div>
            <ul className="divide-y divide-white/5">
              {overview.competitors.length === 0 ? (
                <li className="py-2 text-sm text-slate-500">No tracked competitors yet. Add one to start monitoring.</li>
              ) : (
                overview.competitors.map((competitor) => (
                  <li key={competitor.name} className="flex items-center justify-between gap-3 py-2 text-sm">
                    <span className="truncate text-slate-200">{competitor.name}</span>
                    <Badge variant="neutral">{competitor.count} signals</Badge>
                  </li>
                ))
              )}
            </ul>
          </section>

          {/* Share-of-voice breakdown — visible once signals exist */}
          {overview.share_of_voice && Object.keys(overview.share_of_voice).length > 0 && (
            <section className="rounded-xl bg-slate-800 p-5 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)]">
              <h2 className="mb-3 truncate text-sm font-semibold text-white">Signal breakdown</h2>
              <ul className="space-y-3">
                {Object.entries(overview.share_of_voice as Record<string, Record<string, number>>).map(([comp, types]) => (
                  <li key={comp}>
                    <p className="mb-1.5 truncate text-xs font-medium text-slate-300">{comp}</p>
                    <div className="flex flex-wrap gap-1">
                      {Object.entries(types).map(([stype, cnt]) => (
                        <span
                          key={stype}
                          className="inline-flex items-center gap-1 rounded-full bg-slate-700/60 px-2 py-0.5 text-xs text-slate-300"
                        >
                          <span className="capitalize">{stype.replace(/_/g, ' ')}</span>
                          <span className="font-medium text-slate-100">{cnt}</span>
                        </span>
                      ))}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
