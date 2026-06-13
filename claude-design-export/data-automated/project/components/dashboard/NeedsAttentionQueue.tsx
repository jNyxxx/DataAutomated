import { ChevronRight } from "lucide-react";
import { Badge, type BadgeProps } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { focusRing } from "@/lib/utils";
import type { AttentionItem, SignalUrgency, Stream } from "@/lib/api";

const STREAM_LABEL: Record<Stream, string> = {
  voc: "VoC",
  comp: "Competitive",
  jrn: "Journey",
  system: "System",
};

/** Only `critical` carries the red flag; everything else escalates calmly. */
const URGENCY_BADGE: Record<SignalUrgency, { label: string; variant: BadgeProps["variant"] }> = {
  critical: { label: "CRIT", variant: "critical" },
  high: { label: "HIGH", variant: "high" },
  med: { label: "MED", variant: "warning" },
  low: { label: "LOW", variant: "neutral" },
};

export function NeedsAttentionQueue({ items }: { items: AttentionItem[] }) {
  return (
    <section className="rounded-xl bg-slate-800 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)] p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold text-white">Needs attention</h2>
          <p className="truncate text-xs text-slate-400">Urgent items across all streams</p>
        </div>
        <Button variant="ghost" size="sm">
          View queue
          <ChevronRight className="size-4" />
        </Button>
      </div>

      <ul className="space-y-2">
        {items.map((item) => {
          const u = URGENCY_BADGE[item.urgency];
          return (
            <li key={item.id}>
              <button
                className={`flex w-full items-center gap-3 rounded-lg bg-slate-900/50 p-3 text-left transition-colors hover:bg-slate-900/80 ${focusRing}`}
              >
                <div className="flex shrink-0 items-center gap-2">
                  <Badge variant={item.stream as BadgeProps["variant"]} dot>
                    {STREAM_LABEL[item.stream]}
                  </Badge>
                  <Badge variant={u.variant} dot>
                    {u.label}
                  </Badge>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-100">{item.title}</p>
                  <p className="line-clamp-1 text-xs text-slate-400">{item.meta.join(" · ")}</p>
                </div>
                <ChevronRight className="size-4 shrink-0 text-slate-500" />
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
