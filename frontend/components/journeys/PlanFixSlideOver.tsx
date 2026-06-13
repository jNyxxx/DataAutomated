"use client";

import * as React from "react";
import { Sparkles } from "lucide-react";
import { SlideOver } from "@/components/ui/Overlay";
import { Button } from "@/components/ui/Button";
import { TextField, SelectField } from "@/components/ui/TextField";
import { Badge } from "@/components/ui/Badge";
import { useToast } from "@/components/ui/Toast";
import type { Recommendation } from "@/lib/api";

const rootCauseVariant = (token: string) =>
  token === "ux_friction" ? "high" : token === "messaging" ? "info" : "warning";

/**
 * Plan-fix slide-over — turns an AI recommendation into a Jira ticket.
 * Inputs use the unified Field styling; the submit button shares the same
 * isLoading spinner pattern as the PDF buttons.
 */
export function PlanFixSlideOver({
  open,
  onClose,
  rec,
}: {
  open: boolean;
  onClose: () => void;
  rec: Recommendation | null;
}) {
  const { toast } = useToast();
  const [submitting, setSubmitting] = React.useState(false);

  const onCreate = async () => {
    setSubmitting(true);
    try {
      // Simulated submission — swap for: await createJiraTicket(payload)
      await new Promise((r) => setTimeout(r, 1300));
      toast(`Jira GROWTH-1284 created for "${rec?.title ?? "fix"}"`, "success");
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SlideOver
      open={open}
      onClose={onClose}
      title="Plan fix"
      subtitle="Create an action plan from this recommendation"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button variant="primary" isLoading={submitting} onClick={onCreate}>
            Create Jira ticket
          </Button>
        </>
      }
    >
      <div className="space-y-4 pb-2">
        <div className="rounded-lg bg-slate-900/50 p-3.5">
          <div className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-blue-400">
            <Sparkles className="size-3.5" />
            AI recommendation
          </div>
          <p className="text-sm leading-relaxed text-slate-300">{rec?.title}</p>
          {rec && (
            <div className="mt-2 flex flex-wrap gap-2">
              <Badge variant={rootCauseVariant(rec.root_cause)} dot>
                {rec.root_cause}
              </Badge>
              <Badge variant="success">{rec.projected_lift} projected</Badge>
            </div>
          )}
        </div>

        <TextField label="Issue title" defaultValue={rec ? `Fix: ${rec.title}` : ""} />

        <div className="grid grid-cols-2 gap-3">
          <SelectField label="Project" options={["GROWTH", "WEB", "MOBILE"]} />
          <SelectField label="Priority" options={["High", "Medium", "Low"]} />
        </div>

        <TextField label="Assignee" placeholder="search teammate…" />
        <TextField label="Description" placeholder="Add context for the engineer…" />
      </div>
    </SlideOver>
  );
}
