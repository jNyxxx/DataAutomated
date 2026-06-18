import { Clock, Sparkles } from 'lucide-react';
import { format } from 'date-fns';
import { getTokenServerSide } from '@/lib/auth';
import { fetchClientInfo, fetchEditionStats, fetchInsights, fetchReports } from '@/lib/api';
import { Badge, type BadgeProps } from '@/components/ui/badge';
import { EditionChart } from '@/components/reports/EditionChart';
import { GeneratingReportCard } from '@/components/reports/GeneratingReportCard';
import { DownloadPdfButton } from '@/components/reports/DownloadPdfButton';
import { OpenFullReportButton } from '@/components/reports/ReportActions';
import { NewReportModal } from '@/components/reports/NewReportModal';
import { ReportLibraryClient } from '@/components/reports/ReportLibraryClient';
import { TemplatesSection } from '@/components/reports/TemplatesSection';
import { type Briefing, type BriefingHighlight, type ReportStatus, type Stream } from '@/lib/export-api';
import { type Report } from '@/lib/types';

function safeFormatDate(dateString: string) {
  try {
    return format(new Date(dateString), 'MMM d, yyyy');
  } catch {
    return dateString;
  }
}

function extractTopThemes(raw: unknown, n = 3): BriefingHighlight[] {
  try {
    const t = typeof raw === 'string' ? JSON.parse(raw) : raw;
    let names: string[] = [];
    if (Array.isArray(t)) {
      names = t.slice(0, n).map((x: any) => x?.theme ?? x?.name ?? '').filter(Boolean);
    } else if (t && typeof t === 'object') {
      names = Object.keys(t).slice(0, n);
    }
    return names.map((text) => ({ stream: 'voc' as const, text }));
  } catch {}
  return [];
}

function nextMondayLabel(): string {
  const d = new Date();
  const daysUntil = (8 - d.getDay()) % 7 || 7;
  d.setDate(d.getDate() + daysUntil);
  return format(d, 'MMM d');
}

function streamFromReportType(reportType: string): Stream {
  if (reportType === 'weekly_voc') return 'voc';
  if (reportType === 'competitive_brief') return 'comp';
  if (reportType === 'journey') return 'jrn';
  return 'system';
}

function reportTitleFromType(reportType: string) {
  if (reportType === 'weekly_voc') return 'VoC Analysis';
  if (reportType === 'competitive_brief') return 'Competitive Brief';
  if (reportType === 'journey') return 'Journey Report';
  return 'Executive Weekly';
}

const STREAM_LABEL: Record<string, string> = {
  voc: 'Voice of Customer',
  comp: 'Competitive',
  jrn: 'Journey',
  system: 'Executive',
};

const STATUS_BADGE: Record<string, { label: string; variant: BadgeProps['variant'] }> = {
  ready: { label: 'Ready', variant: 'success' },
  generating: { label: 'Generating', variant: 'warning' },
  scheduled: { label: 'Scheduled', variant: 'neutral' },
};

const SCHEDULE = [
  ['Executive Weekly', 'Mon - 9:00 AM'],
  ['Competitive digest', 'Daily - 8:00 AM'],
  ['VoC summary', 'Fri - 4:00 PM'],
  ['Board pack', '1st of month'],
];

const FORMATS = ['PDF', 'Email digest', 'Notion page', 'CSV data'];

export default async function ReportsPage() {
  const token = (await getTokenServerSide())!;
  const [reportsRes, editionStats, insightsRes, clientInfo] = await Promise.all([
    fetchReports(token).catch(() => ({ reports: [] })),
    fetchEditionStats(token, 'last_7_days', true).catch(() => ({
      sources: 0,
      signals: 0,
      pages: 0,
      volume: [],
    })),
    fetchInsights(token, { limit: 1 }).catch(() => ({ insights: [], total: 0 })),
    fetchClientInfo(token).catch(() => ({ name: '', email: '', plan: '' })),
  ]);
  const latestInsight = insightsRes.insights[0];

  const realReports = reportsRes.reports;
  const reports = realReports.map((report: Report) => ({
    id: report.id,
    title: reportTitleFromType(report.report_type),
    stream: streamFromReportType(report.report_type),
    typeLabel: STREAM_LABEL[streamFromReportType(report.report_type)],
    period:
      report.period_start && report.period_end
        ? `${safeFormatDate(report.period_start)} to ${safeFormatDate(report.period_end)}`
        : 'Custom',
    generated_at: report.created_at ? format(new Date(report.created_at), 'MMM d, yyyy') : 'Unknown',
    pages: report.s3_key ? report.page_count ?? 3 : null,
    status: (report.s3_key ? 'ready' : 'generating') as ReportStatus,
  }));

  const latestReal = realReports[0];
  const latestStatus: ReportStatus = latestReal?.s3_key ? 'ready' : 'generating';
  const briefing: Briefing | null = latestReal
    ? {
        id: latestReal.id,
        week_label: latestReal.period_start ? safeFormatDate(latestReal.period_start) : 'Latest',
        generated_at: latestReal.created_at ? format(new Date(latestReal.created_at), 'h:mm a') : '',
        summary: latestInsight?.narrative ?? '',
        highlights: extractTopThemes(latestInsight?.themes),
        stats: {
          pages: editionStats.pages,
          sources: editionStats.sources,
          signals: editionStats.signals,
          period:
            latestReal.period_start && latestReal.period_end
              ? `${safeFormatDate(latestReal.period_start)} to ${safeFormatDate(latestReal.period_end)}`
              : '',
        },
        volume: editionStats.volume,
        delivery: [{ name: clientInfo.name || 'Admin', role: 'Admin', channel: clientInfo.email }],
        next_send: nextMondayLabel(),
        status: latestStatus,
      }
    : null;

  const generating = reports.find((report) => report.status === 'generating');
  const readyIds = reports.filter((report) => report.status === 'ready').map((report) => report.id);

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <header className="flex flex-wrap items-center gap-4">
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-semibold tracking-tight text-white">Reports</h1>
          <p className="mt-0.5 truncate text-sm text-slate-400">
            Weekly briefings + on-demand - DataAutomated Demo
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <NewReportModal />
        </div>
      </header>

      <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-3">
        <LatestBriefing briefing={briefing} />
        <div className="flex flex-col gap-5">
          <EditionStats briefing={briefing} />
          <DeliveryCard briefing={briefing} />
        </div>
      </div>

      {generating && (
        <div className="mt-5">
          <GeneratingReportCard reportId={generating.id} reportTitle={generating.title} />
        </div>
      )}

      <ReportLibraryClient reports={reports} readyIds={readyIds} />

      <div className="mt-5 grid grid-cols-1 gap-5 md:grid-cols-2">
        <TemplatesSection />
        <div className="flex flex-col gap-5">
          <Schedule />
          <OutputFormats />
        </div>
      </div>
    </div>
  );
}

function LatestBriefing({ briefing }: { briefing: Briefing | null }) {
  const status = STATUS_BADGE[briefing?.status ?? 'scheduled'] || STATUS_BADGE.scheduled;
  return (
    <section className="rounded-xl bg-slate-800 p-5 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)] lg:col-span-2">
      <div className="flex flex-wrap items-center gap-3">
        <Badge variant="system" dot>
          All streams
        </Badge>
        <h2 className="text-base font-semibold text-white">Latest Briefing</h2>
        <span className="min-w-0 truncate text-sm text-slate-400">
          {briefing ? `${briefing.week_label} - generated ${briefing.generated_at}` : '-'}
        </span>
        <Badge variant={status.variant} dot className="ml-auto">
          {status.label}
        </Badge>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-5 sm:grid-cols-[160px_1fr]">
        <div className="hidden flex-col gap-3 sm:flex">
          <div className="flex h-[200px] flex-col gap-2 rounded-xl bg-gradient-to-b from-slate-800 to-slate-900 p-4 shadow-lg ring-1 ring-white/10">
            <span className="truncate text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              DataAutomated
            </span>
            <span className="text-sm font-semibold leading-snug text-white">
              Intelligence Briefing
            </span>
            <div className="mt-2 space-y-1.5 opacity-50">
              <span className="block h-1.5 w-5/6 rounded bg-slate-600" />
              <span className="block h-1.5 w-full rounded bg-slate-600" />
              <span className="block h-1.5 w-11/12 rounded bg-slate-600" />
              <span className="block h-1.5 w-2/3 rounded bg-slate-600" />
            </div>
            <div className="mt-auto flex gap-1.5 pt-3">
              <span className="size-2 rounded-full bg-teal-400" />
              <span className="size-2 rounded-full bg-rose-400" />
              <span className="size-2 rounded-full bg-blue-400" />
            </div>
          </div>
          
          <div className="flex flex-col gap-2">
            {briefing && (
              <>
                <OpenFullReportButton reportId={briefing.id} className="w-full justify-center" />
                <DownloadPdfButton reportId={briefing.id} className="w-full justify-center" />
              </>
            )}
          </div>
        </div>

        <div className="min-w-0">
          <div className="mb-3 flex items-center gap-2 text-xs font-medium text-blue-400">
            <Sparkles className="size-4" />
            AI executive summary
          </div>
          
          {briefing?.summary ? (
            <p className="text-base leading-relaxed text-slate-200">
              {briefing.summary}
            </p>
          ) : (
            <div className="rounded-xl border border-dashed border-white/10 bg-slate-900/50 p-6 text-center shadow-inner">
              <p className="text-sm font-medium text-slate-300">Awaiting AI Analysis</p>
              <p className="mt-1 text-xs text-slate-500">
                The executive summary will appear here once the LLM processes your data.
              </p>
            </div>
          )}

          {briefing?.highlights && briefing.highlights.length > 0 && (
            <ul className="mt-5 space-y-2.5">
              {briefing.highlights.map((highlight, index) => (
                <li key={`${highlight.stream}-${index}`} className="flex items-start gap-3 rounded-xl bg-slate-900/40 p-3.5 ring-1 ring-white/5 transition-colors hover:bg-slate-900/60">
                  <Badge variant={highlight.stream} dot className="mt-0.5 shrink-0">
                    {STREAM_LABEL[highlight.stream]}
                  </Badge>
                  <p className="line-clamp-2 min-w-0 text-sm leading-relaxed text-slate-300">
                    {highlight.text}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}

function EditionStats({ briefing }: { briefing: Briefing | null }) {
  const stats = briefing?.stats;
  const rows: [string, string][] = [
    ['Pages', stats ? String(stats.pages) : '-'],
    ['Sources synthesized', stats ? String(stats.sources) : '-'],
    ['Signals included', stats ? String(stats.signals) : '-'],
    ['Period', stats?.period ?? '-'],
  ];

  return (
    <section className="rounded-xl bg-slate-800 p-5 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)]">
      <h3 className="text-sm font-semibold text-white">This edition</h3>
      <div className="mt-3">
        <EditionChart data={briefing?.volume ?? []} />
      </div>
      <dl className="mt-2 divide-y divide-white/5">
        {rows.map(([label, value]) => (
          <div key={label} className="flex items-center justify-between gap-3 py-2 text-sm">
            <dt className="truncate text-slate-400">{label}</dt>
            <dd className="shrink-0 font-medium tabular-nums text-slate-200">{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function DeliveryCard({ briefing }: { briefing: Briefing | null }) {
  return (
    <section className="rounded-xl bg-slate-800 p-5 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)]">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-white">Delivery</h3>
      </div>
      <ul className="mt-3 space-y-2.5">
        {(briefing?.delivery ?? []).map((d, i) => (
          <li key={i} className="flex items-center justify-between text-sm">
            <span className="text-slate-300">{d.name}</span>
            <span className="truncate text-xs text-slate-500">{d.channel}</span>
          </li>
        ))}
      </ul>
      <div className="mt-3 flex items-center justify-between border-t border-white/5 pt-3 text-sm">
        <span className="flex items-center gap-2 text-slate-400">
          <Clock className="size-4" /> Next send
        </span>
        <span className="font-medium text-slate-200">{briefing?.next_send ?? '-'}</span>
      </div>
    </section>
  );
}

function Schedule() {
  return (
    <section className="rounded-xl bg-slate-800 p-5 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)]">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-white">Schedule</h3>
      </div>
      <dl className="mt-3 divide-y divide-white/5">
        {SCHEDULE.map(([label, value]) => (
          <div key={label} className="flex items-center justify-between gap-3 py-2 text-sm">
            <dt className="truncate text-slate-400">{label}</dt>
            <dd className="shrink-0 font-medium text-slate-200">{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function OutputFormats() {
  return (
    <section className="rounded-xl bg-slate-800 p-5 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)]">
      <h3 className="text-sm font-semibold text-white">Output formats</h3>
      <div className="mt-3 flex flex-wrap gap-2">
        {FORMATS.map((formatLabel, index) => (
          <span
            key={formatLabel}
            className={
              index < 2
                ? 'rounded-full bg-blue-500/10 px-3 py-1 text-xs font-medium text-blue-300'
                : 'rounded-full bg-slate-700/40 px-3 py-1 text-xs font-medium text-slate-400'
            }
          >
            {formatLabel}
          </span>
        ))}
      </div>
      <p className="mt-3 text-xs text-slate-400">PDF and email digest are the active delivery formats.</p>
    </section>
  );
}
