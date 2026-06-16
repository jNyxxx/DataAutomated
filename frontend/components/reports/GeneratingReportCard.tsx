"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export function GeneratingReportCard({
  reportId,
  reportTitle,
}: {
  reportId: string;
  reportTitle: string;
}) {
  const router = useRouter();
  const [elapsed, setElapsed] = React.useState(0);
  const timedOut = elapsed >= 120;

  // Immediate refresh when any agent job completes — avoids waiting for the 15s fallback.
  React.useEffect(() => {
    const onJobEvent = () => router.refresh();
    window.addEventListener('da:job', onJobEvent);
    return () => window.removeEventListener('da:job', onJobEvent);
  }, [router]);

  // 15s fallback polling — graceful degradation when SSE is unavailable.
  React.useEffect(() => {
    if (timedOut) return;
    const interval = setInterval(() => {
      setElapsed(s => s + 15);
      router.refresh();
    }, 15000);
    return () => clearInterval(interval);
  }, [timedOut, router]);

  return (
    <section className="rounded-xl bg-slate-800 p-5">
      <div className="mb-3 flex items-center gap-3">
        <Badge variant="warning" dot>Generating</Badge>
        <h2 className="min-w-0 truncate text-sm font-medium text-white">{reportTitle}</h2>
        <span className="ml-auto shrink-0 text-xs text-slate-400">~2 min · runs in background</span>
      </div>

      {timedOut ? (
        <p className="text-sm text-slate-400">
          Report is taking longer than expected. Refresh the page to check its status.
        </p>
      ) : (
        <div className="flex items-center gap-3">
          <span className="inline-block size-4 shrink-0 rounded-full border-2 border-blue-400 border-t-transparent animate-spin" />
          <p className="text-sm text-slate-400">
            Processing… page updates automatically when complete.
          </p>
        </div>
      )}

      <div className="mt-4 flex gap-2">
        <Button variant="ghost" size="sm" onClick={() => router.refresh()}>
          Check now
        </Button>
      </div>
    </section>
  );
}
