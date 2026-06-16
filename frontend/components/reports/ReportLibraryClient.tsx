"use client";

import * as React from "react";
import { SearchInput } from "@/components/ui/Field";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { DownloadPdfButton } from "@/components/reports/DownloadPdfButton";
import { ExportAllButton, OpenFullReportButton } from "@/components/reports/ReportActions";

type LibraryReport = {
  id: string;
  title: string;
  stream: "voc" | "comp" | "jrn" | "system";
  typeLabel: string;
  period: string;
  generated_at: string;
  pages: number | null;
  status: "ready" | "generating" | "scheduled";
};

const STATUS_BADGE: Record<string, { label: string; variant: BadgeProps["variant"] }> = {
  ready: { label: "Ready", variant: "success" },
  generating: { label: "Generating", variant: "warning" },
  scheduled: { label: "Scheduled", variant: "neutral" },
};

export function ReportLibraryClient({
  reports,
  readyIds,
}: {
  reports: LibraryReport[];
  readyIds: string[];
}) {
  const [search, setSearch] = React.useState("");

  const query = search.trim().toLowerCase();
  const filteredReports = reports.filter((report) => {
    if (!query) return true;
    return [
      report.title,
      report.typeLabel,
      report.period,
    ].some((value) => value.toLowerCase().includes(query));
  });
  const readySet = new Set(readyIds);
  const filteredReadyIds = filteredReports
    .filter((report) => readySet.has(report.id))
    .map((report) => report.id);

  return (
    <section className="mt-5 rounded-xl bg-slate-800 p-5 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)]">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold text-white">Report Library</h3>
          <p className="truncate text-xs text-slate-400">Generated + scheduled</p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <SearchInput
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search reports..."
            className="w-full sm:w-56"
          />
          <ExportAllButton reportIds={filteredReadyIds} />
        </div>
      </div>

      <div className="mt-4 -mx-2 overflow-x-auto px-2">
        <table className="w-full min-w-[720px] border-separate border-spacing-0 text-sm">
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
            {filteredReports.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-6 text-center text-sm text-slate-400">
                  No reports match that search.
                </td>
              </tr>
            ) : (
              filteredReports.map((report) => {
                const status = STATUS_BADGE[report.status] || STATUS_BADGE.ready;
                return (
                  <tr key={report.id} className="group transition-colors hover:bg-slate-700/30">
                    <td className="max-w-[260px] px-3 py-3">
                      <span className="block truncate font-medium text-slate-100">{report.title}</span>
                    </td>
                    <td className="px-3 py-3">
                      <Badge variant={report.stream} dot>
                        {report.typeLabel}
                      </Badge>
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-slate-400">{report.period}</td>
                    <td className="whitespace-nowrap px-3 py-3 text-slate-400">{report.generated_at}</td>
                    <td className="px-3 py-3 text-right tabular-nums text-slate-300">
                      {report.pages ?? "-"}
                    </td>
                    <td className="px-3 py-3">
                      <Badge variant={status.variant} dot>
                        {status.label}
                      </Badge>
                    </td>
                    <td className="px-3 py-3 text-right">
                      {report.status === "ready" ? (
                        <div className="flex justify-end gap-3">
                          <OpenFullReportButton reportId={report.id} label="View" variant="ghost" size="sm" />
                          <DownloadPdfButton reportId={report.id} label="PDF" variant="ghost" size="sm" />
                        </div>
                      ) : report.status === "generating" ? (
                        <span className="text-xs text-slate-400">~2 min</span>
                      ) : null}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
