import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Sparkline } from "@/components/dashboard/Sparkline";
import { SignalVelocityChart } from "@/components/signals/SignalVelocityChart";
import { FunnelChart } from "@/components/journeys/FunnelChart";
import { focusRing } from "@/lib/utils";
import type { DashboardComp, DashboardJourney, DashboardVoc } from "@/lib/api";

function StreamHeader({
  variant,
  label,
  href,
}: {
  variant: "voc" | "comp" | "jrn";
  label: string;
  href: string;
}) {
  return (
    <div className="mb-4 flex items-center justify-between gap-3">
      <Badge variant={variant} dot>
        {label}
      </Badge>
      <a
        href={href}
        className={`inline-flex items-center gap-1 rounded text-xs font-medium text-slate-400 hover:text-slate-200 ${focusRing}`}
      >
        Open
        <ArrowUpRight className="size-3.5" />
      </a>
    </div>
  );
}

export function VocPreview({ data }: { data: DashboardVoc }) {
  return (
    <section className="rounded-xl bg-slate-800 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)] p-5">
      <StreamHeader variant="voc" label="Voice of Customer" href="/insights" />
      <div className="flex items-baseline gap-2">
        <span className="text-2xl font-semibold tabular-nums text-white">
          {data.sentiment_score > 0 ? "+" : ""}
          {data.sentiment_score.toFixed(2)}
        </span>
        <span className={data.sentiment_delta >= 0 ? "text-xs text-teal-400" : "text-xs text-rose-400"}>
          {data.sentiment_delta >= 0 ? "▲" : "▼"} {Math.abs(data.sentiment_delta).toFixed(2)}
        </span>
        <span className="ml-auto truncate text-xs text-slate-400">Sentiment · 30d</span>
      </div>
      <div className="mt-3">
        <Sparkline points={data.trend} stream="voc" height={48} />
      </div>
      <p className="mt-3 truncate text-sm text-slate-400">
        Top theme: <span className="text-slate-200">{data.top_theme}</span>
      </p>
    </section>
  );
}

export function CompetitivePreview({ data }: { data: DashboardComp }) {
  return (
    <section className="rounded-xl bg-slate-800 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)] p-5">
      <StreamHeader variant="comp" label="Competitive" href="/signals" />
      <div className="flex items-center gap-4">
        <div>
          <div className="text-2xl font-semibold tabular-nums text-rose-400">
            {data.critical_open}
          </div>
          <div className="truncate text-xs text-slate-400">critical open</div>
        </div>
        <div>
          <div className="text-2xl font-semibold tabular-nums text-white">{data.signals_7d}</div>
          <div className="truncate text-xs text-slate-400">signals · 7d</div>
        </div>
      </div>
      <div className="mt-3">
        <SignalVelocityChart data={data.velocity} />
      </div>
      <p className="mt-3 truncate text-sm text-slate-400">
        Top competitor: <span className="text-slate-200">{data.top_competitor}</span>
      </p>
    </section>
  );
}

export function JourneyPreview({ data }: { data: DashboardJourney }) {
  return (
    <section className="rounded-xl bg-slate-800 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)] p-5 xl:col-span-2">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Badge variant="jrn" dot>
          Journey Intelligence
        </Badge>
        <p className="truncate text-sm text-slate-400">
          Top funnel drop:{" "}
          <span className="font-medium text-slate-200">{data.top_drop_label}</span>{" "}
          <span className="font-semibold text-rose-400">{data.top_drop_pct}%</span>
        </p>
        <Link
          href="/journeys"
          className={`inline-flex items-center gap-1 rounded text-xs font-medium text-slate-400 hover:text-slate-200 ${focusRing}`}
        >
          Open
          <ArrowUpRight className="size-3.5" />
        </Link>
      </div>
      <FunnelChart steps={data.funnel} />
    </section>
  );
}
