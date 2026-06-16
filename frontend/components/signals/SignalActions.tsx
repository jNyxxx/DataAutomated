"use client";

import * as React from "react";
import { Check, Play } from "lucide-react";
import { useRouter } from "next/navigation";
import { addTrackedCompetitorAction, markSignalReadAction, triggerSignalAnalysisAction } from "@/app/(dashboard)/signals/actions";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/Toast";

export function MarkReadButton({ id, isRead }: { id: string; isRead: boolean }) {
  const router = useRouter();
  const { toast } = useToast();
  const [loading, setLoading] = React.useState(false);

  if (isRead) return <span className="text-xs text-slate-500">Read</span>;

  const onClick = async () => {
    setLoading(true);
    try {
      await markSignalReadAction(id);
      router.refresh();
    } catch {
      toast("Failed to mark read", "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button variant="outline" size="sm" onClick={onClick} disabled={loading}>
      <Check className="mr-2 size-4" />
      {loading ? "Marking..." : "Mark read"}
    </Button>
  );
}

export function RunSignalAnalysisButton({ canTrigger = true }: { canTrigger?: boolean }) {
  const { toast } = useToast();
  const [loading, setLoading] = React.useState(false);

  if (!canTrigger) return null;

  const onClick = async () => {
    setLoading(true);
    try {
      await triggerSignalAnalysisAction();
      toast("Competitive analysis queued — refresh in ~45s to see new signals.", "success");
    } catch {
      toast("Failed to queue competitive analysis", "error");
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

export function AddCompetitorButton({ canTrigger = true }: { canTrigger?: boolean }) {
  const { toast } = useToast();
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [loading, setLoading] = React.useState(false);

  if (!canTrigger) return null;

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setLoading(true);
    try {
      const result = await addTrackedCompetitorAction(name.trim());
      toast(result.message, "success");
      setName("");
      setOpen(false);
      router.refresh();
    } catch (err: any) {
      toast(err.message || "Failed to add competitor", "error");
    } finally {
      setLoading(false);
    }
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 rounded text-xs font-medium text-blue-400 transition-[transform,colors] duration-200 ease-out active:scale-95 hover:text-blue-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
      >
        + Add
      </button>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex items-center gap-1.5">
      <input
        autoFocus
        value={name}
        onChange={e => setName(e.target.value)}
        placeholder="Competitor name"
        className="h-7 w-32 rounded-md bg-slate-900/60 px-2 text-xs text-slate-200 ring-1 ring-inset ring-slate-700 placeholder:text-slate-500 focus:outline-none focus:ring-blue-500"
      />
      <button
        type="submit"
        disabled={loading || !name.trim()}
        className="rounded text-xs font-medium text-blue-400 hover:text-blue-300 disabled:opacity-40"
      >
        {loading ? "…" : "Save"}
      </button>
      <button
        type="button"
        onClick={() => { setOpen(false); setName(""); }}
        className="rounded text-xs text-slate-500 hover:text-slate-300"
      >
        ✕
      </button>
    </form>
  );
}
