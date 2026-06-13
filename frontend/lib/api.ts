/**
 * lib/api.ts — single ingress for all data fetching.
 *
 * Auth is handled isomorphically:
 *   Server (RSC / route handlers): reads the HttpOnly `token` cookie via next/headers,
 *     calls API_URL_INTERNAL directly (no browser hop).
 *   Client components: calls the /api/backend proxy which reads the HttpOnly cookie
 *     server-side and forwards the Authorization header. Client JS never touches the JWT.
 *
 * No X-Tenant-Id header — backend resolves tenant from the JWT claim.
 */

/* ─────────────────────────────── core ─────────────────────────────────── */

const serverBase = () =>
  process.env.API_URL_INTERNAL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

async function getAuthToken(): Promise<string | null> {
  if (typeof window === "undefined") {
    const { cookies } = await import("next/headers");
    return (await cookies()).get("token")?.value ?? null;
  }
  return null; // client: /api/backend proxy injects the token
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const isServer = typeof window === "undefined";
  const url = isServer ? `${serverBase()}${path}` : `/api/backend${path}`;
  const token = await getAuthToken();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(url, {
    ...init,
    headers: { ...headers, ...(init.headers as Record<string, string> | undefined) },
    cache: "no-store",
  });

  if (!res.ok) throw new ApiError(res.status, `${init.method ?? "GET"} ${path} → ${res.status}`);
  return res.json() as Promise<T>;
}

export async function authHeaders(): Promise<Record<string, string>> {
  const token = await getAuthToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// Login calls the Next.js route handler which sets the HttpOnly cookie.
export async function login(email: string, password: string): Promise<void> {
  const res = await fetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new ApiError(res.status, `auth:${res.status}`);
}

/* ─────────────────────────── shared types ──────────────────────────────── */

export type Stream = "voc" | "comp" | "jrn" | "system";
export type ReportStatus = "ready" | "generating" | "scheduled";
export type RunStatus = "ok" | "running" | "error";
export type SourceState = "ok" | "stale" | "syncing" | "error" | "off";
export type Sentiment = "pos" | "neg" | "neu";
export type Urgency = "high" | "med" | "low";
export type Confidence = "high" | "med" | "low";
export type SignalUrgency = "critical" | "high" | "med" | "low";

/* ─────────────────────────── reports ──────────────────────────────────── */

export interface Report {
  id: string;
  title: string;
  stream: Stream;
  period: string;
  generated_at: string;
  pages: number | null;
  status: ReportStatus;
}

export interface BriefingHighlight {
  stream: Exclude<Stream, "system">;
  text: string;
}

export interface Briefing {
  id: string;
  week_label: string;
  generated_at: string;
  status: ReportStatus;
  summary: string;
  highlights: BriefingHighlight[];
  stats: { pages: number; sources: number; signals: number; period: string };
  volume: { day: string; signals: number }[];
  delivery: { name: string; role: string; channel: string }[];
  next_send: string;
}

export interface SourceHealth {
  id: string;
  name: string;
  is_active: boolean;
  message?: string;
}

export interface PdfRef {
  s3_key: string;
  url: string;
}

// Adapter: /api/reports/list → Report[]
export async function getReports(): Promise<Report[]> {
  try {
    const raw = await apiFetch<{ reports: BackendReport[] }>("/api/reports/list");
    return (raw.reports ?? []).map(adaptReport);
  } catch {
    return [];
  }
}

// No backend equivalent for weekly briefing — components gracefully handle null.
export async function getLatestBriefing(): Promise<Briefing | null> {
  return null;
}

// Adapter: /api/data-sources → SourceHealth[]
export async function getSourceHealth(): Promise<SourceHealth[]> {
  try {
    const sources = await apiFetch<BackendDataSource[]>("/api/data-sources");
    return sources.map((s) => ({
      id: s.id,
      name: s.source_type,
      is_active: s.connection_status !== "failed",
      message:
        s.connection_status === "failed"
          ? `${s.source_type} integration is down — ingestion is paused.`
          : undefined,
    }));
  } catch {
    return [];
  }
}

// Adapter: /api/reports/{id}/download-url → PdfRef
export async function getReportPdf(reportId: string): Promise<PdfRef> {
  const raw = await apiFetch<{ url: string }>(`/api/reports/${encodeURIComponent(reportId)}/download-url`);
  return { s3_key: "", url: raw.url };
}

// No /reports/{id}/stream endpoint — useGenerationStream polls /api/reports/list instead.
export const reportStreamUrl = (_reportId: string): null => null;

/* ─────────────────────────── VoC ──────────────────────────────────────── */

export interface NarrativeSpan {
  text: string;
  emphasis?: boolean;
}

export interface SentimentPoint {
  day: string;
  score: number;
}

export interface SentimentMix {
  positive: number;
  negative: number;
  neutral: number;
}

export interface Theme {
  id: string;
  name: string;
  count: number;
  pct: number;
  urgency: Urgency;
}

export interface Feedback {
  id: string;
  source: string;
  sentiment: Sentiment;
  urgency: Urgency;
  text: string;
  theme: string;
  when: string;
}

export interface VocInsights {
  narrative: NarrativeSpan[];
  sentiment_score: number;
  sentiment_delta: number;
  churn_risk: number;
  churn_delta_pts: number;
  trend: SentimentPoint[];
  mix: SentimentMix;
  themes: Theme[];
  feedback: Feedback[];
}

// Adapter: /insights/latest → VocInsights
export async function getVocInsights(): Promise<VocInsights> {
  const raw = await apiFetch<{ insight: BackendInsight | null }>("/insights/latest");
  const ins = raw.insight;

  if (!ins) {
    return {
      narrative: [{ text: "No insights have been synthesized yet. Run an analysis to populate this view." }],
      sentiment_score: 0,
      sentiment_delta: 0,
      churn_risk: 0,
      churn_delta_pts: 0,
      trend: [],
      mix: { positive: 0, negative: 0, neutral: 0 },
      themes: [],
      feedback: [],
    };
  }

  const themes: Theme[] = parseThemes(ins.themes);
  const mix = buildMix(ins.sentiment_label);
  const narrative = buildNarrative(ins.narrative);

  return {
    narrative,
    sentiment_score: ins.sentiment_score ?? 0,
    sentiment_delta: 0,
    churn_risk: ins.churn_risk ?? 0,
    churn_delta_pts: 0,
    trend: [],
    mix,
    themes,
    feedback: [], // raw feedback not persisted per CLAUDE.md §2
  };
}

/* ─────────────────────────── Journey ──────────────────────────────────── */

export interface FunnelStep {
  id: string;
  label: string;
  pct: number;
  count: number;
  critical?: boolean;
}

export interface FrictionDiagnosis {
  location: string;
  dropoff_pct: number;
  root_cause: string;
  root_cause_label: string;
  detail: string;
  revenue_at_risk: string;
  affected_sessions: number;
  friction_score: number;
}

export interface Recommendation {
  id: string;
  title: string;
  root_cause: string;
  confidence: Confidence;
  projected_lift: string;
}

export interface DeviceDropoff {
  device: string;
  pct: number;
}

export interface JourneySegment {
  id: string;
  name: string;
  conversion: number;
}

export interface JourneyInsights {
  funnel_name: string;
  funnel: FunnelStep[];
  diagnosis: FrictionDiagnosis;
  recommendations: Recommendation[];
  device_dropoff: DeviceDropoff[];
  segments: JourneySegment[];
}

// Adapter: /journeys/latest → JourneyInsights
export async function getJourneyInsights(): Promise<JourneyInsights> {
  const raw = await apiFetch<{ insights: BackendJourney[]; total: number }>(
    "/journeys/latest?limit=20",
  );
  const rows = raw.insights ?? [];
  const latest = rows[0];

  const emptyDiagnosis: FrictionDiagnosis = {
    location: "—",
    dropoff_pct: 0,
    root_cause: "No data",
    root_cause_label: "No data yet",
    detail: "Connect a behavioral source (Mixpanel, Segment) to see friction analysis.",
    revenue_at_risk: "—",
    affected_sessions: 0,
    friction_score: 0,
  };

  if (!latest) {
    return {
      funnel_name: "Main onboarding funnel",
      funnel: [],
      diagnosis: emptyDiagnosis,
      recommendations: [],
      device_dropoff: [],
      segments: [],
    };
  }

  const frictionCauseLabel: Record<string, string> = {
    ux_friction: "UX friction",
    messaging: "Messaging mismatch",
    expectation: "Expectation gap",
  };

  const diagnosis: FrictionDiagnosis = {
    location: latest.funnel_step ?? "Unknown step",
    dropoff_pct: Math.round((latest.drop_off_rate ?? 0) * 100),
    root_cause: latest.friction_cause ?? "unknown",
    root_cause_label: frictionCauseLabel[latest.friction_cause ?? ""] ?? latest.friction_cause ?? "Unknown",
    detail: latest.recommendation ?? "",
    revenue_at_risk: "—",
    affected_sessions: 0,
    friction_score: latest.friction_score ?? 0,
  };

  const funnel: FunnelStep[] = [{
    id: latest.id,
    label: latest.funnel_step ?? "Unknown",
    pct: Math.round((1 - (latest.drop_off_rate ?? 0)) * 100),
    count: 0,
    critical: (latest.drop_off_rate ?? 0) > 0.3,
  }];

  const recommendations: Recommendation[] = latest.recommendation
    ? [{
        id: `${latest.id}-rec`,
        title: latest.recommendation,
        root_cause: latest.friction_cause ?? "",
        confidence: (latest.friction_score ?? 0) > 0.7 ? "high" : (latest.friction_score ?? 0) > 0.4 ? "med" : "low",
        projected_lift: latest.projected_lift ? `${Math.round(latest.projected_lift * 100)}%` : "—",
      }]
    : [];

  return {
    funnel_name: "Main onboarding funnel",
    funnel,
    diagnosis,
    recommendations,
    device_dropoff: [],
    segments: [],
  };
}

/* ─────────────────────────── Competitive ──────────────────────────────── */

export interface CompetitiveSignal {
  id: string;
  competitor: string;
  category: string;
  urgency: SignalUrgency;
  title: string;
  context: string;
  source: string;
  when: string;
}

export interface VelocityPoint {
  day: string;
  count: number;
}

export interface TrackedCompetitor {
  id: string;
  name: string;
  signals: number;
}

export interface CompetitiveOverview {
  positioning: string;
  signals_7d: number;
  critical_open: number;
  top_competitor: string;
}

export interface CompetitiveSignals {
  signals: CompetitiveSignal[];
  velocity: VelocityPoint[];
  overview: CompetitiveOverview;
  tracked: TrackedCompetitor[];
}

// Adapter: /signals/latest → CompetitiveSignals
export async function getCompetitiveSignals(): Promise<CompetitiveSignals> {
  const raw = await apiFetch<{ signals: BackendSignal[]; total: number }>(
    "/signals/latest?limit=50",
  );
  const rows = raw.signals ?? [];

  const urgencyMap: Record<string, SignalUrgency> = {
    critical: "critical",
    high: "high",
    medium: "med",
    med: "med",
    low: "low",
  };

  const signals: CompetitiveSignal[] = rows.map((s) => ({
    id: s.id,
    competitor: s.competitor_name ?? "Unknown",
    category: s.signal_type ?? "news",
    urgency: urgencyMap[s.urgency ?? "low"] ?? "low",
    title: s.raw_content?.slice(0, 120) ?? "New competitive signal",
    context: s.strategic_context ?? "",
    source: s.signal_source ?? "—",
    when: s.detected_at ? formatRelativeTime(s.detected_at) : "—",
  }));

  const velocity = buildVelocity(rows.map((s) => s.detected_at ?? ""));
  const criticalOpen = rows.filter((s) => s.urgency === "critical" && !s.is_read).length;

  const competitorCounts: Record<string, number> = {};
  for (const s of rows) {
    const name = s.competitor_name ?? "Unknown";
    competitorCounts[name] = (competitorCounts[name] ?? 0) + 1;
  }
  const tracked: TrackedCompetitor[] = Object.entries(competitorCounts).map(([name, count]) => ({
    id: name,
    name,
    signals: count,
  }));

  const topCompetitor =
    tracked.sort((a, b) => b.signals - a.signals)[0]?.name ?? "";

  return {
    signals,
    velocity,
    overview: {
      positioning: "",
      signals_7d: rows.filter((s) => isWithin7Days(s.detected_at ?? "")).length,
      critical_open: criticalOpen,
      top_competitor: topCompetitor,
    },
    tracked,
  };
}

/* ─────────────────────────── Dashboard ────────────────────────────────── */

export interface Kpi {
  id: string;
  label: string;
  stream: Stream;
  value: string;
  delta: string;
  direction: "up" | "down";
  spark: number[];
}

export interface AttentionItem {
  id: string;
  stream: Stream;
  urgency: SignalUrgency;
  title: string;
  meta: string[];
}

export interface AgentRun {
  id: string;
  name: string;
  status: RunStatus;
  when: string;
}

export interface SourceStatus {
  id: string;
  name: string;
  state: SourceState;
  detail: string;
}

export interface DashboardVoc {
  sentiment_score: number;
  sentiment_delta: number;
  trend: number[];
  top_theme: string;
}

export interface DashboardComp {
  critical_open: number;
  signals_7d: number;
  velocity: VelocityPoint[];
  top_competitor: string;
}

export interface DashboardJourney {
  funnel: FunnelStep[];
  top_drop_label: string;
  top_drop_pct: number;
}

export interface DashboardSummary {
  kpis: Kpi[];
  attention: AttentionItem[];
  agent_runs: AgentRun[];
  sources: SourceStatus[];
  voc: DashboardVoc;
  competitive: DashboardComp;
  journey: DashboardJourney;
}

// Adapter: /api/dashboard/summary + /api/data-sources → DashboardSummary
export async function getDashboardSummary(): Promise<DashboardSummary> {
  const [summaryResult, sourcesResult] = await Promise.allSettled([
    apiFetch<BackendDashboard>("/api/dashboard/summary"),
    apiFetch<BackendDataSource[]>("/api/data-sources"),
  ]);

  const s = summaryResult.status === "fulfilled" ? summaryResult.value : null;
  const rawSources = sourcesResult.status === "fulfilled" ? sourcesResult.value : [];

  const kpis: Kpi[] = [
    {
      id: "sentiment",
      label: "Sentiment score",
      stream: "voc",
      value: s ? (s.sentiment_score > 0 ? "+" : "") + s.sentiment_score.toFixed(2) : "—",
      delta: "—",
      direction: (s?.sentiment_score ?? 0) >= 0 ? "up" : "down",
      spark: [],
    },
    {
      id: "churn",
      label: "Churn risk",
      stream: "voc",
      value: s ? `${(s.churn_risk * 100).toFixed(1)}%` : "—",
      delta: "—",
      direction: (s?.churn_risk ?? 0) < 0.15 ? "up" : "down",
      spark: [],
    },
    {
      id: "signals",
      label: "Unread signals",
      stream: "comp",
      value: s ? String(s.unread_signals) : "—",
      delta: "—",
      direction: "down",
      spark: [],
    },
    {
      id: "dropoff",
      label: "Top drop-off",
      stream: "jrn",
      value: s?.latest_drop_off_rate != null ? `${(s.latest_drop_off_rate * 100).toFixed(0)}%` : "—",
      delta: "—",
      direction: "down",
      spark: [],
    },
  ];

  const sources: SourceStatus[] = rawSources.map((src) => ({
    id: src.id,
    name: src.source_type,
    state: connectionStateMap(src.connection_status),
    detail: src.last_synced_at ? `Last synced ${formatRelativeTime(src.last_synced_at)}` : "Never synced",
  }));

  return {
    kpis,
    attention: [],
    agent_runs: [],
    sources,
    voc: {
      sentiment_score: s?.sentiment_score ?? 0,
      sentiment_delta: 0,
      trend: [],
      top_theme: "",
    },
    competitive: {
      critical_open: 0,
      signals_7d: s?.unread_signals ?? 0,
      velocity: [],
      top_competitor: "",
    },
    journey: {
      funnel: [],
      top_drop_label: s?.latest_funnel_step ?? "",
      top_drop_pct: s?.latest_drop_off_rate ? Math.round(s.latest_drop_off_rate * 100) : 0,
    },
  };
}

/* ──────────────────── backend raw types (internal) ────────────────────── */

interface BackendDashboard {
  sentiment_score: number;
  churn_risk: number;
  unread_signals: number;
  latest_funnel_step: string | null;
  latest_drop_off_rate: number | null;
}

interface BackendInsight {
  id: string;
  sentiment_score: number | null;
  sentiment_label: string | null;
  churn_risk: number | null;
  narrative: string | null;
  themes: string | null; // JSONB returned as string
  created_at: string;
}

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

interface BackendJourney {
  id: string;
  funnel_step: string | null;
  drop_off_rate: number | null;
  friction_score: number | null;
  friction_cause: string | null;
  recommendation: string | null;
  projected_lift: number | null;
  created_at: string;
}

interface BackendReport {
  id: string;
  report_type: string | null;
  s3_key: string | null;
  period_start: string | null;
  period_end: string | null;
  created_at: string;
}

interface BackendDataSource {
  id: string;
  source_type: string;
  connection_status: string;
  last_synced_at: string | null;
  is_active: boolean;
}

/* ──────────────────────── transformation helpers ───────────────────────── */

function parseThemes(raw: string | null): Theme[] {
  if (!raw) return [];
  try {
    const parsed: unknown = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!Array.isArray(parsed)) return [];
    return (parsed as Record<string, unknown>[]).map((t, i) => ({
      id: String(t["id"] ?? i),
      name: String(t["name"] ?? t["theme"] ?? t["label"] ?? `Theme ${i + 1}`),
      count: Number(t["count"] ?? 0),
      pct: Number(t["pct"] ?? t["percentage"] ?? 0),
      urgency: (["high", "med", "low"].includes(String(t["urgency"])) ? t["urgency"] : "low") as Urgency,
    }));
  } catch {
    return [];
  }
}

function buildMix(label: string | null): SentimentMix {
  if (label === "positive") return { positive: 100, negative: 0, neutral: 0 };
  if (label === "negative") return { positive: 0, negative: 100, neutral: 0 };
  if (label === "mixed") return { positive: 40, negative: 40, neutral: 20 };
  return { positive: 0, negative: 0, neutral: 100 };
}

function buildNarrative(text: string | null): NarrativeSpan[] {
  if (!text) return [];
  return [{ text, emphasis: false }];
}

function adaptReport(r: BackendReport): Report {
  const streamMap: Record<string, Stream> = {
    weekly_voc: "voc",
    competitive_brief: "comp",
    journey: "jrn",
  };
  return {
    id: r.id,
    title: r.report_type?.replace(/_/g, " ") ?? "Report",
    stream: streamMap[r.report_type ?? ""] ?? "system",
    period: r.period_start
      ? `${r.period_start.slice(0, 10)} – ${(r.period_end ?? r.created_at).slice(0, 10)}`
      : r.created_at.slice(0, 10),
    generated_at: r.created_at,
    pages: null,
    status: r.s3_key ? "ready" : "scheduled",
  };
}

function connectionStateMap(status: string): SourceState {
  if (status === "active") return "ok";
  if (status === "failed") return "error";
  if (status === "pending_configuration") return "stale";
  return "off";
}

function buildVelocity(dates: string[]): VelocityPoint[] {
  const counts: Record<string, number> = {};
  for (const d of dates) {
    if (!d) continue;
    const day = d.slice(0, 10);
    counts[day] = (counts[day] ?? 0) + 1;
  }
  return Object.entries(counts)
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-7)
    .map(([day, count]) => ({ day, count }));
}

function isWithin7Days(dateStr: string): boolean {
  if (!dateStr) return false;
  const d = new Date(dateStr).getTime();
  return Date.now() - d < 7 * 24 * 60 * 60 * 1000;
}

function formatRelativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}
