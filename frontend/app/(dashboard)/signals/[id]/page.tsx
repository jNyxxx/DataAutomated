import { cookies } from "next/headers";
import Link from "next/link";
import { Badge, type BadgeProps } from "@/components/ui/Badge";
import MarkSignalRead from "@/components/mark-signal-read";

interface BackendSignal {
  id: string;
  competitor_name: string | null;
  signal_type: string | null;
  signal_source: string | null;
  raw_content: string | null;
  strategic_context: string | null;
  urgency: string | null;
  detected_at: string | null;
  is_read: boolean;
}

interface PageProps {
  params: Promise<{ id: string }>;
}

const URGENCY_BADGE: Record<string, { label: string; variant: BadgeProps["variant"] }> = {
  critical: { label: "Critical", variant: "critical" },
  high:     { label: "High", variant: "high" },
  medium:   { label: "Medium", variant: "warning" },
  med:      { label: "Medium", variant: "warning" },
  low:      { label: "Low", variant: "neutral" },
};

async function fetchSignal(id: string): Promise<{ signal: BackendSignal | null }> {
  const cookieStore = await cookies();
  const token = cookieStore.get("token")?.value;
  const base =
    process.env.API_URL_INTERNAL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

  try {
    const res = await fetch(`${base}/signals/${id}`, {
      cache: "no-store",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) return { signal: null };
    return res.json() as Promise<{ signal: BackendSignal | null }>;
  } catch {
    return { signal: null };
  }
}

export default async function SignalDetailPage({ params }: PageProps) {
  const { id } = await params;
  const { signal } = await fetchSignal(id);

  if (!signal) {
    return (
      <div className="p-6">
        <Link href="/signals" className="text-sm text-blue-400 hover:underline">
          ← Competitive Signals
        </Link>
        <p className="mt-4 text-sm text-slate-400">Signal not found.</p>
      </div>
    );
  }

  const badge = URGENCY_BADGE[signal.urgency ?? "low"] ?? URGENCY_BADGE.low;

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
      <MarkSignalRead signalId={id} />
      <Link href="/signals" className="text-sm text-blue-400 hover:underline">
        ← Competitive Signals
      </Link>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold text-white">
          {signal.competitor_name ?? "Unknown"} — {signal.signal_type ?? "Signal"}
        </h1>
        <Badge variant={badge.variant} dot>{badge.label}</Badge>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-4">
        {[
          { label: "Source", value: signal.signal_source },
          { label: "Detected", value: signal.detected_at?.slice(0, 10) },
        ].map(({ label, value }) => (
          <div key={label} className="rounded-xl bg-slate-800 p-4 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)]">
            <div className="mb-1 text-xs text-slate-400">{label}</div>
            <div className="text-sm font-medium text-slate-200">{value ?? "—"}</div>
          </div>
        ))}
      </div>

      {signal.raw_content && (
        <div className="mt-5 rounded-xl bg-slate-800 p-5 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)]">
          <h2 className="mb-2 text-sm font-semibold text-white">Raw signal</h2>
          <p className="text-sm leading-relaxed text-slate-300">{signal.raw_content}</p>
        </div>
      )}

      {signal.strategic_context && (
        <div className="mt-5 rounded-xl bg-slate-800 p-5 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)]">
          <h2 className="mb-2 text-sm font-semibold text-white">Strategic context</h2>
          <p className="text-sm leading-relaxed text-slate-300">{signal.strategic_context}</p>
        </div>
      )}
    </div>
  );
}
