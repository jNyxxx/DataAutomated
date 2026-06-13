import { Plus, Share2, Sparkles, Clock } from "lucide-react";
import { Badge, type BadgeProps } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { SearchInput, FilterSelect, DateRangeButton } from "@/components/ui/Field";
import { EditionChart } from "@/components/reports/EditionChart";
import { GeneratingReportCard } from "@/components/reports/GeneratingReportCard";
import { DownloadPdfButton } from "@/components/reports/DownloadPdfButton";
import { focusRing } from "@/lib/utils";
import {
  getReports,
  getLatestBriefing,
  type Report,
  type Briefing,
  type ReportStatus,
  type Stream,
} from "@/lib/api";

/* ----------------------------- static config ----------------------------- */

const STREAM_LABEL: Record<Stream, string> = {
  voc: "Voice of Customer",
  comp: "Competitive",
  jrn: "Journey",
  system: "Executive",
};

const STATUS_BADGE: Record<ReportStatus, { label: string; variant: BadgeProps["variant"] }> = {
  ready: { label: "Ready", variant: "success" },
  generating: { label: "Generating", variant: "warning" },
  scheduled: { label: "Scheduled", variant: "neutral" },
};

const TEMPLATES: { name: string; stream: Stream; label?: string; desc: string }[] = [
  { name: "Executive Weekly", stream: "system", label: "All streams", desc: "Leadership briefing across all three services" },
  { name: "VoC Deep-Dive", stream: "voc", desc: "Theme clusters, sentiment + verbatim samples" },
  { name: "Competitive Brief", stream: "comp", desc: "Signals grouped by urgency + strategic context" },
  { name: "Journey Funnel Review", stream: "jrn", desc: "Drop-off analysis + recommended fixes" },
];

const SCHEDULE = [
  ["Executive Weekly", "Mon · 9:00 AM"],
  ["Competitive digest", "Daily · 8:00 AM"],
  ["VoC summary", "Fri · 4:00 PM"],
  ["Board pack", "1st of month"],
];

const FORMATS = ["PDF", "Slack message", "Email digest", "Notion page", "CSV data"];

/* --------------------------------- page ---------------------------------- */

export default async function ReportsPage() {
  // ALL fetches go through lib/api → JWT + tenant headers are attached server-side.
  const [reportsRes, briefingRes] = await Promise.allSettled([
    getReports(),
    getLatestBriefing(),
  ]);
  const reports: Report[] = reportsRes.status === "fulfilled" ? reportsRes.value : [];
  const briefing: Briefing | null = briefingRes.status === "fulfilled" ? briefingRes.value : null;
  const generating = reports.find((r) => r.status === "generating");

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      {/* Header */}
      <header className="flex flex-wrap items-center gap-4">
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-semibold tracking-tight text-white">Reports</h1>
          <p className="mt-0.5 truncate text-sm text-slate-400">
            Weekly briefings + on-demand · Acme SaaS Inc.
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <SearchInput placeholder="Search reports…" className="w-40 sm:w-56" />
          <Button variant="primary">
            <Plus className="size-4" />
            New report
          </Button>
        </div>
      </header>

      {/* Filters */}
      <div className="mt-5 flex flex-wrap items-center gap-2">
        <FilterSelect label="Type" options={["All", "Executive", "VoC", "Competitive", "Journey"]} />
        <FilterSelect label="Stream" options={["All", "VoC", "Competitive", "Journey"]} />
        <FilterSelect label="Status" options={["All", "Ready", "Generating", "Scheduled"]} />
        <DateRangeButton />
      </div>

      {/* Hero: latest briefing + side rail */}
      <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-3">
        <LatestBriefing briefing={briefing} />
        <div className="flex flex-col gap-5">
          <EditionStats briefing={briefing} />
          <DeliveryCard briefing={briefing} />
        </div>
      </div>

      {/* Active generation (driven by the authenticated SSE stream) */}
      {generating && (
        <div className="mt-5">
          <GeneratingReportCard reportId={generating.id} reportTitle={generating.title} />
        </div>
      )}

      {/* Library */}
      <ReportLibrary reports={reports} />

      {/* Templates + schedule */}
      <div className="mt-5 grid grid-cols-1 gap-5 md:grid-cols-2">
        <Templates />
        <div className="flex flex-col gap-5">
          <Schedule />
          <OutputFormats />
        </div>
      </div>
    </div>
  );
}

/* ------------------------------- sections -------------------------------- */

function LatestBriefing({ briefing }: { briefing: Briefing | null }) {
  return (
    <section className="rounded-xl bg-slate-800 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)] p-5 lg:col-span-2">
      <div className="flex flex-wrap items-center gap-3">
        <Badge variant="system" dot>
          All streams
        </Badge>
        <h2 className="text-base font-semibold text-white">Latest Briefing</h2>
        <span className="min-w-0 truncate text-sm text-slate-400">
          {briefing ? `${briefing.week_label} · generated ${briefing.generated_at}` : "—"}
        </span>
        <Badge variant="success" dot className="ml-auto">
          Ready
        </Badge>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-5 sm:grid-cols-[140px_1fr]">
        {/* Cover */}
        <div className="hidden flex-col gap-2 rounded-lg bg-slate-900 p-4 sm:flex">
          <span className="truncate text-[10px] font-semibold uppercase tracking-wider text-slate-500">
            DataAutomated · Weekly
          </span>
          <span className="text-sm font-semibold leading-snug text-white">
            Intelligence Briefing
          </span>
          <div className="mt-1 space-y-1.5">
            <span className="block h-1.5 w-5/6 rounded bg-slate-700" />
            <span className="block h-1.5 w-full rounded bg-slate-700" />
            <span className="block h-1.5 w-11/12 rounded bg-slate-700" />
            <span className="block h-1.5 w-2/3 rounded bg-slate-700" />
          </div>
          <div className="mt-auto flex gap-1.5 pt-3">
            <span className="size-2 rounded-full bg-teal-400" />
            <span className="size-2 rounded-full bg-rose-400" />
            <span className="size-2 rounded-full bg-blue-400" />
          </div>
        </div>

        {/* Narrative — the core value, elevated but clamped so messy data can't break layout */}
        <div className="min-w-0">
          <div className="mb-3 flex items-center gap-2 text-xs font-medium text-blue-400">
            <Sparkles className="size-4" />
            AI executive summary
          </div>
          <p className="line-clamp-3 text-lg leading-relaxed text-slate-200">
            {briefing?.summary ??
              "This week's executive summary will appear here once the briefing has generated."}
          </p>

          <ul className="mt-4 space-y-2">
            {(briefing?.highlights ?? []).map((h, i) => (
              <li key={i} className="flex items-start gap-3 rounded-lg bg-slate-900/50 p-3">
                <Badge variant={h.stream} dot className="mt-0.5 shrink-0">
                  {STREAM_LABEL[h.stream]}
                </Badge>
                <p className="line-clamp-2 min-w-0 text-sm leading-relaxed text-slate-300">
                  {h.text}
                </p>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        <Button variant="primary">Open full report</Button>
        {briefing && <DownloadPdfButton reportId={briefing.id} />}
        <Button variant="default">
          <Share2 className="size-4" />
          Share to Slack
        </Button>
      </div>
    </section>
  );
}

function EditionStats({ briefing }: { briefing: Briefing | null }) {
  const s = briefing?.stats;
  const rows: [string, string][] = [
    ["Pages", s ? String(s.pages) : "—"],
    ["Sources synthesized", s ? String(s.sources) : "—"],
    ["Signals included", s ? String(s.signals) : "—"],
    ["Period", s?.period ?? "—"],
  ];
  return (
    <section className="rounded-xl bg-slate-800 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)] p-5">
      <h3 className="text-sm font-semibold text-white">This edition</h3>
      <div className="mt-3">
        <EditionChart data={briefing?.volume ?? []} />
      </div>
      <dl className="mt-2 divide-y divide-white/5">
        {rows.map(([k, v]) => (
          <div key={k} className="flex items-center justify-between gap-3 py-2 text-sm">
            <dt className="truncate text-slate-400">{k}</dt>
            <dd className="shrink-0 font-medium tabular-nums text-slate-200">{v}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function DeliveryCard({ briefing }: { briefing: Briefing | null }) {
  const recipients = briefing?.delivery ?? [];
  return (
    <section className="rounded-xl bg-slate-800 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)] p-5">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-white">Delivery</h3>
        <button className={`rounded text-xs font-medium text-blue-400 hover:text-blue-300 ${focusRing}`}>
          Edit
        </button>
      </div>
      <ul className="mt-3 space-y-2.5">
        {recipients.map((r) => (
          <li key={r.name} className="flex items-center gap-3">
            <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-slate-700/60 text-xs font-semibold text-slate-200">
              {r.name[0]}
            </span>
            <span className="min-w-0 flex-1 truncate text-sm text-slate-200">
              {r.name}
              <span className="text-slate-400"> · {r.role}</span>
            </span>
            <span className="shrink-0 text-xs text-slate-400">{r.channel}</span>
          </li>
        ))}
      </ul>
      <div className="mt-3 flex items-center justify-between border-t border-white/5 pt-3 text-sm">
        <span className="flex items-center gap-2 text-slate-400">
          <Clock className="size-4" /> Next send
        </span>
        <span className="font-medium text-slate-200">{briefing?.next_send ?? "—"}</span>
      </div>
    </section>
  );
}

function ReportLibrary({ reports }: { reports: Report[] }) {
  return (
    <section className="mt-5 rounded-xl bg-slate-800 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)] p-5">
      <div className="flex items-center justify-between">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold text-white">Report Library</h3>
          <p className="truncate text-xs text-slate-400">Generated + scheduled</p>
        </div>
        <button className={`rounded text-xs font-medium text-blue-400 hover:text-blue-300 ${focusRing}`}>
          Export all
        </button>
      </div>

      {/* Horizontal scroll keeps the table usable on mobile without a redesign. */}
      <div className="mt-4 -mx-2 overflow-x-auto px-2">
        <table className="w-full min-w-[640px] border-separate border-spacing-0 text-sm">
          <thead>
            <tr className="text-left text-xs font-medium uppercase tracking-wider text-slate-400">
              <th className="px-3 py-2 font-medium">Report</th>
              <th className="px-3 py-2 font-medium">Type</th>
              <th className="px-3 py-2 font-medium">Period</th>
              <th className="px-3 py-2 font-medium">Generated</th>
              <th className="px-3 py-2 text-right font-medium">Pages</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody className="[&>tr]:border-t [&>tr]:border-white/5">
            {reports.map((r) => {
              const s = STATUS_BADGE[r.status];
              return (
                <tr key={r.id} className="group transition-colors hover:bg-slate-700/30">
                  <td className="max-w-[260px] px-3 py-3">
                    <span className="block truncate font-medium text-slate-100">{r.title}</span>
                  </td>
                  <td className="px-3 py-3">
                    <Badge variant={r.stream} dot>
                      {STREAM_LABEL[r.stream]}
                    </Badge>
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 text-slate-400">{r.period}</td>
                  <td className="whitespace-nowrap px-3 py-3 text-slate-400">{r.generated_at}</td>
                  <td className="px-3 py-3 text-right tabular-nums text-slate-300">
                    {r.pages ?? "—"}
                  </td>
                  <td className="px-3 py-3">
                    <Badge variant={s.variant} dot>
                      {s.label}
                    </Badge>
                  </td>
                  <td className="px-3 py-3 text-right">
                    {r.status === "ready" ? (
                      <div className="flex justify-end gap-3">
                        <button className={`rounded text-xs font-medium text-blue-400 hover:text-blue-300 ${focusRing}`}>
                          View
                        </button>
                        <DownloadPdfButton reportId={r.id} label="PDF" variant="ghost" size="sm" />
                      </div>
                    ) : r.status === "generating" ? (
                      <span className="text-xs text-slate-400">~2 min</span>
                    ) : (
                      <button className={`rounded text-xs font-medium text-slate-400 hover:text-slate-200 ${focusRing}`}>
                        Edit
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Templates() {
  return (
    <section className="rounded-xl bg-slate-800 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)] p-5">
      <div className="flex items-center justify-between">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold text-white">Report Templates</h3>
          <p className="truncate text-xs text-slate-400">Start from a structure</p>
        </div>
        <button className={`rounded text-xs font-medium text-blue-400 hover:text-blue-300 ${focusRing}`}>
          + Custom
        </button>
      </div>
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {TEMPLATES.map((t) => (
          <div key={t.name} className="flex flex-col gap-2.5 rounded-lg bg-slate-900/50 p-4">
            <Badge variant={t.stream} dot className="max-w-full self-start">
              <span className="truncate">{t.label ?? STREAM_LABEL[t.stream]}</span>
            </Badge>
            <p className="truncate text-sm font-medium text-slate-100">{t.name}</p>
            <p className="line-clamp-2 text-xs leading-relaxed text-slate-400">{t.desc}</p>
            <Button variant="default" size="sm" className="mt-1 self-start">
              Use template
            </Button>
          </div>
        ))}
      </div>
    </section>
  );
}

function Schedule() {
  return (
    <section className="rounded-xl bg-slate-800 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)] p-5">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-white">Schedule</h3>
        <button className={`rounded text-xs font-medium text-blue-400 hover:text-blue-300 ${focusRing}`}>
          Manage
        </button>
      </div>
      <dl className="mt-3 divide-y divide-white/5">
        {SCHEDULE.map(([k, v]) => (
          <div key={k} className="flex items-center justify-between gap-3 py-2 text-sm">
            <dt className="truncate text-slate-400">{k}</dt>
            <dd className="shrink-0 font-medium text-slate-200">{v}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function OutputFormats() {
  return (
    <section className="rounded-xl bg-slate-800 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)] p-5">
      <h3 className="text-sm font-semibold text-white">Output formats</h3>
      <div className="mt-3 flex flex-wrap gap-2">
        {FORMATS.map((f, i) => (
          <span
            key={f}
            className={
              i < 2
                ? "rounded-full bg-blue-500/10 px-3 py-1 text-xs font-medium text-blue-300"
                : "rounded-full bg-slate-700/40 px-3 py-1 text-xs font-medium text-slate-400"
            }
          >
            {f}
          </span>
        ))}
      </div>
      <p className="mt-3 text-xs text-slate-400">PDF + Slack are the active delivery formats.</p>
    </section>
  );
}
