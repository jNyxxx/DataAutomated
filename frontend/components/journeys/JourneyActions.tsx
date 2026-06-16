"use client";

import * as React from "react";
import { Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { triggerJourneyAnalysisAction } from "@/app/(dashboard)/journeys/actions";
import { useToast } from "@/components/ui/Toast";

export function AnalyzeJourneyButton({ canTrigger = true }: { canTrigger?: boolean }) {
  const { toast } = useToast();
  const [loading, setLoading] = React.useState(false);

  if (!canTrigger) return null;

  const onClick = async () => {
    setLoading(true);
    try {
      const result = await triggerJourneyAnalysisAction();
      if (result.ok) {
        toast("Journey analysis queued — refresh in ~60s to see results.", "success");
      } else {
        toast(result.error ?? "Failed to queue journey analysis", "error");
      }
    } catch {
      toast("Failed to queue journey analysis", "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button variant="primary" onClick={onClick} disabled={loading}>
      <Play className="mr-2 size-4" />
      {loading ? "Queuing..." : "Run Analysis"}
    </Button>
  );
}
