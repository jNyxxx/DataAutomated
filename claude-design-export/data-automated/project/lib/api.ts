/**
 * lib/api.ts — single ingress for ALL data fetching.
 *
 * Every server- and client-side request goes through here so that:
 *   • the JWT Bearer token is always attached, and
 *   • the tenant id is always sent (tenant isolation is non-negotiable).
 *
 * The token + tenant are resolved isomorphically:
 *   • Server (RSC / route handlers): read from httpOnly cookies via next/headers.
 *   • Client: read from the non-httpOnly `da_tenant` cookie + in-memory token.
 */

export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "https://api.dataautomated.io";

export type Stream = "voc" | "comp" | "jrn" | "system";
export type ReportStatus = "ready" | "generating" | "scheduled";

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

/* ---------------------------------- auth ---------------------------------- */

async function getAuthToken(): Promise<string | null> {
  if (typeof window === "undefined") {
    // Server: dynamic import keeps `next/headers` out of the client bundle.
    const { cookies } = await import("next/headers");
    return cookies().get("da_token")?.value ?? null;
  }
  return readCookie("da_token");
}

async function getTenantId(): Promise<string | null> {
  if (typeof window === "undefined") {
    const { cookies } = await import("next/headers");
    return cookies().get("da_tenant")?.value ?? null;
  }
  return readCookie("da_tenant");
}

function readCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

/** Auth + tenant headers — also consumed by the SSE hook. */
export async function authHeaders(): Promise<Record<string, string>> {
  const [token, tenant] = await Promise.all([getAuthToken(), getTenantId()]);
  const headers: Record<string, string> = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;
  if (tenant) headers["X-Tenant-Id"] = tenant;
  return headers;
}

/* --------------------------------- client --------------------------------- */

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
  const headers = await authHeaders();
  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...headers,
      ...(init.headers as Record<string, string> | undefined),
    },
    cache: "no-store",
  });

  if (!res.ok) {
    throw new ApiError(res.status, `${init.method ?? "GET"} ${path} → ${res.status}`);
  }
  return (await res.json()) as T;
}

/* -------------------------------- endpoints ------------------------------- */

export const getReports = () => apiFetch<Report[]>("/reports");

export const getLatestBriefing = () => apiFetch<Briefing>("/reports/latest-briefing");

export const getSourceHealth = () => apiFetch<SourceHealth[]>("/sources/health");

/** Resolves the S3 signed URL for a report PDF (async; powers the loading state). */
export const getReportPdf = (reportId: string) =>
  apiFetch<PdfRef>(`/reports/${encodeURIComponent(reportId)}/pdf`);

/** Absolute URL for the report generation SSE stream. */
export const reportStreamUrl = (reportId: string) =>
  `${API_BASE_URL}/reports/${encodeURIComponent(reportId)}/stream`;

/* ------------------------- Voice of Customer (VoC) ------------------------ */

export type Sentiment = "pos" | "neg" | "neu";
export type Urgency = "high" | "med" | "low";

/** Narrative is returned as styled spans so key insights can be emphasized. */
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
  /** 0–100, share of mentions for the bar width. */
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
  /** 0–1. */
  churn_risk: number;
  churn_delta_pts: number;
  trend: SentimentPoint[];
  mix: SentimentMix;
  themes: Theme[];
  feedback: Feedback[];
}

export const getVocInsights = () => apiFetch<VocInsights>("/insights/voc");

/* ----------------------------- Journey (JX) ------------------------------ */

export type Confidence = "high" | "med" | "low";

export interface FunnelStep {
  id: string;
  label: string;
  /** 0–100 share of the top of funnel. */
  pct: number;
  count: number;
  /** Marks the largest leak so the chart can highlight it. */
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
  /** Empty until a behavioral source (Mixpanel/Segment) is connected. */
  segments: JourneySegment[];
}

export const getJourneyInsights = () => apiFetch<JourneyInsights>("/insights/journey");

/* --------------------------- Competitive (CI) ---------------------------- */

export type SignalUrgency = "critical" | "high" | "med" | "low";

export interface CompetitiveSignal {
  id: string;
  competitor: string;
  category: string; // pricing | hiring | product | reviews | news
  urgency: SignalUrgency;
  /** Raw scraped headline. */
  title: string;
  /** AI strategic interpretation of the move. */
  context: string;
  source: string; // LinkedIn | G2 | TechCrunch | pricing page …
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

export const getCompetitiveSignals = () =>
  apiFetch<CompetitiveSignals>("/insights/competitive");

/* ------------------------------ Dashboard -------------------------------- */

export type RunStatus = "ok" | "running" | "error";
export type SourceState = "ok" | "stale" | "syncing" | "error" | "off";

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

export const getDashboardSummary = () => apiFetch<DashboardSummary>("/dashboard/summary");
