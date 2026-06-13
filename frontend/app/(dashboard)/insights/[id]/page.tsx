import { cookies } from "next/headers";
import Link from "next/link";
import { Badge } from "@/components/ui/Badge";

interface BackendInsight {
  id: string;
  sentiment_score: number | null;
  urgency_score?: number | null;
  churn_risk: number | null;
  narrative: string | null;
  themes: string | null;
  period_start?: string | null;
  period_end?: string | null;
}

interface PageProps {
  params: Promise<{ id: string }>;
}

async function fetchInsight(id: string): Promise<{ insight: BackendInsight | null }> {
  const cookieStore = await cookies();
  const token = cookieStore.get("token")?.value;
  const base =
    process.env.API_URL_INTERNAL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

  try {
    const res = await fetch(`${base}/insights/${id}`, {
      cache: "no-store",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) return { insight: null };
    return res.json() as Promise<{ insight: BackendInsight | null }>;
  } catch {
    return { insight: null };
  }
}

export default async function InsightDetailPage({ params }: PageProps) {
  const { id } = await params;
  const { insight } = await fetchInsight(id);

  if (!insight) {
    return (
      <div className="p-6">
        <Link href="/insights" className="text-sm text-blue-400 hover:underline">
          ← Voice of Customer
        </Link>
        <p className="mt-4 text-sm text-slate-400">Insight not found.</p>
      </div>
    );
  }

  let themes: Array<{ name: string; count: number }> = [];
  try {
    const parsed: unknown = JSON.parse(insight.themes ?? "[]");
    if (Array.isArray(parsed)) {
      themes = (parsed as Record<string, unknown>[]).map((t) => ({
        name: String(t["name"] ?? t["theme"] ?? "Unknown"),
        count: Number(t["count"] ?? 1),
      }));
    }
  } catch {
    // themes stays empty
  }

  const sentimentLabel =
    (insight.sentiment_score ?? 0) > 0.2
      ? "positive"
      : (insight.sentiment_score ?? 0) < -0.2
        ? "negative"
        : "neutral";

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
      <Link href="/insights" className="text-sm text-blue-400 hover:underline">
        ← Voice of Customer
      </Link>

      <div className="mt-4 flex items-center gap-3">
        <h1 className="text-xl font-semibold text-white">VoC Insight</h1>
        <span className="font-mono text-xs text-slate-500">{insight.id.slice(0, 8)}…</span>
      </div>

      <div className="mt-5 grid grid-cols-3 gap-4">
        {[
          { label: "Sentiment", value: Number(insight.sentiment_score ?? 0).toFixed(2) },
          { label: "Churn risk", value: `${(Number(insight.churn_risk ?? 0) * 100).toFixed(1)}%` },
          { label: "Urgency", value: Number(insight.urgency_score ?? 0).toFixed(2) },
        ].map(({ label, value }) => (
          <div key={label} className="rounded-xl bg-slate-800 p-4 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)]">
            <div className="mb-1 text-xs text-slate-400">{label}</div>
            <div className="text-2xl font-semibold tabular-nums text-white">{value}</div>
          </div>
        ))}
      </div>

      <div className="mt-4">
        <Badge
          variant={sentimentLabel === "positive" ? "success" : sentimentLabel === "negative" ? "critical" : "neutral"}
          dot
        >
          {sentimentLabel.charAt(0).toUpperCase() + sentimentLabel.slice(1)} sentiment
        </Badge>
      </div>

      {insight.narrative && (
        <div className="mt-5 rounded-xl bg-slate-800 p-5 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)]">
          <h2 className="mb-2 text-sm font-semibold text-white">AI Narrative</h2>
          <p className="text-sm leading-relaxed text-slate-300">{insight.narrative}</p>
        </div>
      )}

      {themes.length > 0 && (
        <div className="mt-5 rounded-xl bg-slate-800 p-5 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)]">
          <h2 className="mb-3 text-sm font-semibold text-white">Top themes</h2>
          <ul className="space-y-2">
            {themes.map((t) => (
              <li key={t.name} className="flex items-center gap-3 text-sm">
                <span className="min-w-0 flex-1 truncate text-slate-200">{t.name}</span>
                <span className="tabular-nums text-slate-400">{t.count}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {(insight.period_start ?? insight.period_end) && (
        <p className="mt-4 text-xs text-slate-500">
          Period: {insight.period_start?.slice(0, 10)} → {insight.period_end?.slice(0, 10)}
        </p>
      )}
    </div>
  );
}
