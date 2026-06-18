"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { generateReportAction } from "@/app/(dashboard)/reports/actions";
import { useToast } from "@/components/ui/Toast";

type Stream = "system" | "voc" | "comp" | "jrn";

const STREAM_LABEL: Record<Stream, string> = {
  system: "Executive",
  voc: "Voice of Customer",
  comp: "Competitive",
  jrn: "Journey",
};

const STREAM_TO_REPORT_TYPE: Record<Stream, string> = {
  system: "weekly_intelligence",
  voc: "weekly_voc",
  comp: "competitive_brief",
  jrn: "journey",
};

const TEMPLATES: { name: string; stream: Stream; label?: string; desc: string }[] = [
  { name: "Executive Weekly", stream: "system", label: "All streams", desc: "Leadership briefing across all three services" },
  { name: "VoC Deep-Dive", stream: "voc", desc: "Theme clusters, sentiment + verbatim samples" },
  { name: "Competitive Brief", stream: "comp", desc: "Signals grouped by urgency + strategic context" },
  { name: "Journey Funnel Review", stream: "jrn", desc: "Drop-off analysis + recommended fixes" },
];

const PERIODS = [
  { value: "last_7_days", label: "Last 7 days" },
  { value: "last_30_days", label: "Last 30 days" },
  { value: "last_90_days", label: "Last 90 days" },
];

export function TemplatesSection() {
  const [open, setOpen] = React.useState(false);
  const [selectedType, setSelectedType] = React.useState("weekly_intelligence");
  const [selectedName, setSelectedName] = React.useState("");
  const [period, setPeriod] = React.useState("last_30_days");
  const [loading, setLoading] = React.useState(false);
  const router = useRouter();
  const { toast } = useToast();

  const openModal = (stream: Stream, name: string) => {
    setSelectedType(STREAM_TO_REPORT_TYPE[stream]);
    setSelectedName(name);
    setPeriod("last_30_days");
    setOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await generateReportAction(selectedType, period);
      toast("Report queued — generating in background", "success");
      setOpen(false);
      router.refresh();
    } catch (err: any) {
      toast(err.message || "Failed to queue report", "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="rounded-xl bg-slate-800 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)] p-5">
      <div className="flex items-center justify-between">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold text-white">Report Templates</h3>
          <p className="truncate text-xs text-slate-400">Start from a structure</p>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {TEMPLATES.map((t) => (
          <div key={t.name} className="flex flex-col gap-2.5 rounded-lg bg-slate-900/50 p-4">
            <Badge variant={t.stream} dot className="max-w-full self-start">
              <span className="truncate">{t.label ?? STREAM_LABEL[t.stream]}</span>
            </Badge>
            <p className="truncate text-sm font-medium text-slate-100">{t.name}</p>
            <p className="text-xs leading-relaxed text-slate-400">{t.desc}</p>
            <Button
              variant="default"
              size="sm"
              className="mt-1 self-start"
              onClick={() => openModal(t.stream, t.name)}
            >
              Use template
            </Button>
          </div>
        ))}
      </div>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-sm rounded-xl bg-slate-800 shadow-2xl ring-1 ring-inset ring-white/10 p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-base font-semibold text-white">Generate Report</h2>
            <p className="mt-0.5 text-xs text-slate-400">{selectedName}</p>

            <form onSubmit={handleSubmit} className="mt-5 space-y-4">
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
                  onClick={() => setOpen(false)}
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
    </section>
  );
}
