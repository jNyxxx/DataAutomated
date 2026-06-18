"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { triggerJourneyAnalysisAction } from "@/app/(dashboard)/journeys/actions";
import { usePersistedStatus } from "@/hooks/usePersistedStatus";

export function PlanFixButton() {
  const [isPending, setIsPending] = useState(false);
  const { status, setStatus } = usePersistedStatus("journey_plan_fix");
  const [errorMsg, setErrorMsg] = useState("");

  async function handleClick() {
    // Persist "queuing" immediately so that navigating away and returning
    // shows "Queued ✓" rather than resetting to idle.
    setStatus("queuing");
    setIsPending(true);
    try {
      const result = await triggerJourneyAnalysisAction();
      if (result.ok) {
        setStatus("queued");
      } else {
        setStatus("error");
        setErrorMsg(result.error ?? "Unknown error");
      }
    } finally {
      setIsPending(false);
    }
  }

  const isQueuing = isPending || status === "queuing";

  return (
    <div className="flex items-center gap-2">
      <Button
        variant="outline"
        type="button"
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          handleClick();
        }}
        disabled={isQueuing || status === "queued"}
      >
        {isQueuing ? "Queuing..." : status === "queued" ? "Queued ✓" : "Plan fix"}
      </Button>
      {status === "error" && (
        <span className="text-xs text-rose-400">{errorMsg}</span>
      )}
    </div>
  );
}
