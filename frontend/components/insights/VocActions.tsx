"use client";

import * as React from "react";
import { Download, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { exportVocAction, triggerVoCAnalysisAction } from "@/app/(dashboard)/insights/actions";
import { useToast } from "@/components/ui/Toast";

export function AnalyzeButton({ canTrigger = true }: { canTrigger?: boolean }) {
  const { toast } = useToast();
  const [isPending, setIsPending] = React.useState(false);

  if (!canTrigger) return null;

  const onClick = async () => {
    setIsPending(true);
    try {
      await triggerVoCAnalysisAction();
      toast("VoC analysis queued — refresh in ~60s to see results.", "success");
    } catch {
      toast("Failed to queue analysis", "error");
    } finally {
      setIsPending(false);
    }
  };

  return (
    <Button variant="primary" onClick={onClick} disabled={isPending}>
      <Play className="mr-2 size-4" />
      {isPending ? "Queuing..." : "Run Analysis"}
    </Button>
  );
}

export function ExportVocButton() {
  const { toast } = useToast();
  const [isPending, setIsPending] = React.useState(false);

  const onClick = async () => {
    setIsPending(true);
    try {
      const result = await exportVocAction();
      toast(result.message, "success");
    } catch {
      toast("Failed to start VoC export", "error");
    } finally {
      setIsPending(false);
    }
  };

  return (
    <Button variant="ghost" onClick={onClick} disabled={isPending} className="text-teal-400 hover:text-teal-300">
      <Download className="size-4 mr-2" /> 
      {isPending ? "Exporting..." : "Export"}
    </Button>
  );
}
