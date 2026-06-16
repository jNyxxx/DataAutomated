"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { generateReportAction } from "@/app/(dashboard)/reports/actions";
import { useToast } from "@/components/ui/Toast";

const REPORT_TYPES = [
  { value: "weekly_intelligence", label: "Executive Weekly" },
  { value: "weekly_voc",          label: "VoC Analysis" },
  { value: "competitive_brief",   label: "Competitive Brief" },
  { value: "journey",             label: "Journey Report" },
];

const PERIODS = [
  { value: "last_7_days",  label: "Last 7 days" },
  { value: "last_30_days", label: "Last 30 days" },
  { value: "last_90_days", label: "Last 90 days" },
];

export function NewReportModal() {
  const [isOpen, setIsOpen] = React.useState(false);
  const [reportType, setReportType] = React.useState("weekly_intelligence");
  const [period, setPeriod] = React.useState("last_30_days");
  const [loading, setLoading] = React.useState(false);
  const router = useRouter();
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await generateReportAction(reportType, period);
      toast("Report queued — generating in background", "success");
      setIsOpen(false);
      router.refresh();
    } catch (err: any) {
      toast(err.message || "Failed to queue report", "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Button variant="primary" onClick={() => setIsOpen(true)}>
        <Plus className="size-4" />
        New report
      </Button>

      {isOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => setIsOpen(false)}
        >
          <div
            className="w-full max-w-sm rounded-xl bg-slate-800 shadow-2xl ring-1 ring-inset ring-white/10 p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-base font-semibold text-white">Generate Report</h2>
            <p className="mt-0.5 text-xs text-slate-400">Choose type and period then generate</p>

            <form onSubmit={handleSubmit} className="mt-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  Report type
                </label>
                <select
                  value={reportType}
                  onChange={(e) => setReportType(e.target.value)}
                  className="w-full rounded-lg border border-white/10 bg-slate-700 px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {REPORT_TYPES.map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  Period
                </label>
                <select
                  value={period}
                  onChange={(e) => setPeriod(e.target.value)}
                  className="w-full rounded-lg border border-white/10 bg-slate-700 px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {PERIODS.map((p) => (
                    <option key={p.value} value={p.value}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex gap-2 pt-1">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setIsOpen(false)}
                  className="flex-1"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  disabled={loading}
                  className="flex-1"
                >
                  {loading ? "Queuing…" : "Generate"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
