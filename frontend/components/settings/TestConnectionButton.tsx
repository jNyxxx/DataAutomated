"use client";

import * as React from "react";
import { RefreshCw } from "lucide-react";
import { cn, focusRing } from "@/lib/utils";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/Toast";
import { testConnectionAction } from "@/app/(dashboard)/settings/actions";

/**
 * Inline "Test" / "Retry" button rendered on source rows whose status is
 * pending_configuration or failed. Calls the live validator and reflects
 * the result immediately via a toast; router.refresh() re-fetches the
 * Server Component so the status badge updates without a full page reload.
 */
export function TestConnectionButton({
  sourceId,
  sourceName,
  status,
}: {
  sourceId: string;
  sourceName: string;
  status: string;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [loading, setLoading] = React.useState(false);

  const handleTest = async () => {
    setLoading(true);
    try {
      const result = await testConnectionAction(sourceId);
      if (result.connection_status === "active") {
        toast(`${sourceName} — connection validated`, "success");
      } else {
        toast(result.error ?? `${sourceName} — connection failed`, "error");
      }
      router.refresh();
    } catch {
      toast(`${sourceName} — test request failed`, "error");
    } finally {
      setLoading(false);
    }
  };

  const label = status === "failed" ? "Retry" : "Test";

  return (
    <button
      onClick={handleTest}
      disabled={loading}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-[transform,colors] duration-200 ease-out active:scale-95 disabled:opacity-50",
        status === "failed"
          ? "bg-red-500/15 text-red-300 hover:bg-red-500/25"
          : "bg-blue-500/15 text-blue-300 hover:bg-blue-500/25",
        focusRing,
      )}
    >
      <RefreshCw className={cn("size-3", loading && "animate-spin")} />
      {loading ? "Testing…" : label}
    </button>
  );
}
