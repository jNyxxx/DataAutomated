"use client";

import * as React from "react";
import { ExternalLink, FileText, Loader2 } from "lucide-react";
import { Button, type ButtonProps } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/components/ui/Toast";

type OpenFullReportButtonProps = {
  reportId: string;
  label?: string;
  variant?: ButtonProps["variant"];
  size?: ButtonProps["size"];
  className?: string;
};

export function OpenFullReportButton({
  reportId,
  label = "Open full report",
  variant = "primary",
  size,
  className,
}: OpenFullReportButtonProps) {
  const { toast } = useToast();
  const [open, setOpen] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [reportHtml, setReportHtml] = React.useState<string | null>(null);
  const [reportBlobUrl, setReportBlobUrl] = React.useState<string | null>(null);
  const previewUrl = `/api/reports/${reportId}/file`;

  const loadReport = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    setReportHtml(null);
    setReportBlobUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    try {
      const res = await fetch(previewUrl, { credentials: "same-origin" });
      if (!res.ok) {
        let message = "Failed to load report preview.";
        try {
          const payload = await res.json();
          if (typeof payload?.detail === "string" && payload.detail) {
            message = payload.detail;
          }
        } catch {
          // ignore JSON parse failures
        }
        throw new Error(message);
      }
      const buf = await res.arrayBuffer();
      const bytes = new Uint8Array(buf);
      // %PDF magic bytes: 0x25 0x50 0x44 0x46
      const isPdf =
        bytes.length >= 4 &&
        bytes[0] === 0x25 &&
        bytes[1] === 0x50 &&
        bytes[2] === 0x44 &&
        bytes[3] === 0x46;
      if (isPdf) {
        const blob = new Blob([buf], { type: "application/pdf" });
        setReportBlobUrl(URL.createObjectURL(blob));
      } else {
        setReportHtml(new TextDecoder().decode(buf));
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to load report preview.";
      setError(message);
      toast(message, "error");
    } finally {
      setLoading(false);
    }
  }, [previewUrl, toast]);

  const handleOpenChange = React.useCallback(
    (nextOpen: boolean) => {
      setOpen(nextOpen);
      if (!nextOpen) {
        setReportHtml(null);
        setError(null);
        setReportBlobUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return null;
        });
      } else if (!loading) {
        void loadReport();
      }
    },
    [loadReport, loading],
  );

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <Button
        variant={variant}
        size={size}
        className={className}
        onClick={() => handleOpenChange(true)}
      >
        {label}
      </Button>

      <DialogContent className="left-auto right-0 top-0 grid h-screen max-h-screen w-[min(96vw,1100px)] max-w-[1100px] translate-x-0 translate-y-0 grid-rows-[auto_minmax(0,1fr)] gap-0 overflow-hidden rounded-none border-l border-white/10 bg-slate-950 p-0 sm:rounded-none">
        <DialogHeader className="border-b border-white/10 px-5 py-4">
          <div className="flex items-start justify-between gap-4 pr-8">
            <div className="min-w-0">
              <DialogTitle className="text-base text-white">Full report</DialogTitle>
              <DialogDescription className="mt-1 text-slate-400">
                Preview the generated PDF without leaving the reports page.
              </DialogDescription>
            </div>
            <a
              href={previewUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm font-medium text-slate-200 transition-colors hover:bg-slate-800"
            >
              <ExternalLink className="size-4" />
              Open in new tab
            </a>
          </div>
        </DialogHeader>

        <div className="min-h-0 bg-slate-900">
          {loading && (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-sm text-slate-400">
              <Loader2 className="size-5 animate-spin text-blue-400" />
              Loading report preview...
            </div>
          )}

          {!loading && error && (
            <div className="flex h-full flex-col items-center justify-center gap-4 px-6 text-center">
              <div className="grid size-12 place-items-center rounded-full bg-slate-800 text-slate-300">
                <FileText className="size-5" />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-medium text-white">Report preview unavailable</p>
                <p className="text-sm text-slate-400">{error}</p>
              </div>
              <Button variant="outline" onClick={() => void loadReport()}>
                Try again
              </Button>
            </div>
          )}

          {!loading && !error && reportHtml && (
            <iframe
              title="Full report preview"
              srcDoc={reportHtml}
              className="h-full w-full bg-white"
            />
          )}

          {!loading && !error && reportBlobUrl && (
            <iframe
              title="Full report preview"
              src={reportBlobUrl}
              className="h-full w-full bg-white"
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function ExportAllButton({ reportIds }: { reportIds: string[] }) {
  const { toast } = useToast();
  const [loading, setLoading] = React.useState(false);

  const onClick = () => {
    if (reportIds.length === 0) {
      toast("No ready reports to export", "error");
      return;
    }
    setLoading(true);
    reportIds.forEach((id) => {
      window.open(`/api/reports/${id}/file?download=1`, "_blank", "noopener,noreferrer");
    });
    toast(`Downloading ${reportIds.length} report(s)`, "success");
    setLoading(false);
  };

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      className="rounded text-sm font-medium text-blue-400 transition-colors hover:text-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
    >
      {loading ? "Exporting..." : "Export all"}
    </button>
  );
}
