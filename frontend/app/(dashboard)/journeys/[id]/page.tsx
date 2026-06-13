import { cookies } from "next/headers";
import Link from "next/link";
import { FunnelChart } from "@/components/journeys/FunnelChart";

interface BackendJourney {
  id: string;
  funnel_step: string | null;
  drop_off_rate: number | null;
  friction_score: number | null;
  friction_cause: string | null;
  recommendation: string | null;
  projected_lift: number | null;
}

interface PageProps {
  params: Promise<{ id: string }>;
}

const FRICTION_LABELS: Record<string, string> = {
  ux_friction: "UX Friction",
  messaging: "Messaging mismatch",
  expectation: "Expectation gap",
};

async function fetchJourney(_id: string): Promise<{ insights: BackendJourney[] }> {
  const cookieStore = await cookies();
  const token = cookieStore.get("token")?.value;
  const base =
    process.env.API_URL_INTERNAL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

  try {
    const res = await fetch(`${base}/journeys/latest?limit=50`, {
      cache: "no-store",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) return { insights: [] };
    return res.json() as Promise<{ insights: BackendJourney[] }>;
  } catch {
    return { insights: [] };
  }
}

export default async function JourneyDetailPage({ params }: PageProps) {
  const { id } = await params;
  const { insights } = await fetchJourney(id);
  const journey = insights.find((j) => j.id === id) ?? null;

  if (!journey) {
    return (
      <div className="p-6">
        <Link href="/journeys" className="text-sm text-blue-400 hover:underline">
          ← Journey Intelligence
        </Link>
        <p className="mt-4 text-sm text-slate-400">Journey insight not found.</p>
      </div>
    );
  }

  const funnelSteps = insights
    .filter((j) => j.drop_off_rate != null)
    .map((j, i) => ({
      id: j.id,
      label: j.funnel_step ?? `Step ${i + 1}`,
      pct: Math.round((1 - (j.drop_off_rate ?? 0)) * 100),
      count: 0,
      critical: j.id === id,
    }));

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
      <Link href="/journeys" className="text-sm text-blue-400 hover:underline">
        ← Journey Intelligence
      </Link>

      <h1 className="mt-4 text-xl font-semibold text-white">
        {journey.funnel_step ?? "Journey step"}
      </h1>

      <div className="mt-5 grid grid-cols-3 gap-4">
        {[
          {
            label: "Drop-off rate",
            value:
              journey.drop_off_rate != null
                ? `${(journey.drop_off_rate * 100).toFixed(1)}%`
                : "—",
          },
          {
            label: "Friction score",
            value:
              journey.friction_score != null
                ? journey.friction_score.toFixed(2)
                : "—",
          },
          {
            label: "Projected lift",
            value:
              journey.projected_lift != null
                ? `${(journey.projected_lift * 100).toFixed(1)}%`
                : "—",
          },
        ].map(({ label, value }) => (
          <div key={label} className="rounded-xl bg-slate-800 p-4 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)]">
            <div className="mb-1 text-xs text-slate-400">{label}</div>
            <div className="text-2xl font-semibold tabular-nums text-white">{value}</div>
          </div>
        ))}
      </div>

      {journey.friction_cause && (
        <div className="mt-4 rounded-lg bg-slate-800 px-4 py-3 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)]">
          <span className="text-xs text-slate-400">Friction cause: </span>
          <span className="text-sm font-medium text-slate-200">
            {FRICTION_LABELS[journey.friction_cause] ?? journey.friction_cause}
          </span>
        </div>
      )}

      {journey.recommendation && (
        <div className="mt-5 rounded-xl bg-slate-800 p-5 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)]">
          <h2 className="mb-2 text-sm font-semibold text-white">Recommendation</h2>
          <p className="text-sm leading-relaxed text-slate-300">{journey.recommendation}</p>
        </div>
      )}

      {funnelSteps.length > 0 && (
        <div className="mt-5 rounded-xl bg-slate-800 p-5 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)]">
          <h2 className="mb-3 text-sm font-semibold text-white">Funnel</h2>
          <FunnelChart steps={funnelSteps} />
        </div>
      )}
    </div>
  );
}
