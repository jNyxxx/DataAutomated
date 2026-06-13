"use client";

import * as React from "react";
import { Share2, Download, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { shareToSlackAction, exportAllReportsAction, getDownloadUrlAction } from "@/app/(dashboard)/reports/actions";
import { addToast } from "@/components/ui/Toast";

export function ShareToSlackButton({ reportId }: { reportId: string }) {
  const [loading, setLoading] = React.useState(false);

  const onClick = async () => {
    setLoading(true);
    try {
      const result = await shareToSlackAction(reportId);
      addToast(result.message, "success");
    } catch (e: any) {
      addToast(e.message || "Failed to share to Slack", "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button variant="default" onClick={onClick} disabled={loading}>
      <Share2 className="size-4" />
      {loading ? "Sharing..." : "Share to Slack"}
    </Button>
  );
}

export function OpenFullReportButton({ reportId }: { reportId: string }) {
  const [loading, setLoading] = React.useState(false);

  const onClick = async () => {
    setLoading(true);
    try {
      const { url } = await getDownloadUrlAction(reportId);
      // For full report, we simulate opening a detailed web view if it existed,
      // but since it's just PDF generation, we'll open the PDF directly.
      window.open(url, "_blank", "noopener,noreferrer");
    } catch {
      addToast("Failed to open report", "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button variant="primary" onClick={onClick} disabled={loading}>
      {loading ? "Opening..." : "Open full report"}
    </Button>
  );
}

export function ExportAllButton() {
  const [loading, setLoading] = React.useState(false);

  const onClick = async () => {
    setLoading(true);
    try {
      const result = await exportAllReportsAction();
      addToast(result.message, "success");
    } catch {
      addToast("Failed to start export", "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <button onClick={onClick} disabled={loading} className="text-sm font-medium text-blue-400 hover:text-blue-300 disabled:opacity-50 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 rounded">
      {loading ? "Exporting..." : "Export all"}
    </button>
  );
}
