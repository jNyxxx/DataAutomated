// Auth
export interface User {
  id: string;
  client_id: string;
  role: 'admin' | 'analyst' | 'viewer';
}

export interface AuthTokenResponse {
  access_token: string;
  token_type: string;
}

// Dashboard
export interface AgentRun {
  actor: string;
  resource: string;
  created_at: string | null;
}

export interface DashboardSummary {
  sentiment_score: number | null;
  churn_risk: number | null;
  unread_signals: number | null;
  critical_signals?: number;
  latest_funnel_step: string | null;
  latest_drop_off_rate: number | null;
  agent_runs_24h: number;
  runs_hourly?: number[];
  recent_agent_runs: AgentRun[];
}

// Raw feedback samples
export interface FeedbackSample {
  id: string;
  source_type: string;
  content: string;
  ingested_at: string | null;
}

export interface FeedbackSamplesResponse {
  samples: FeedbackSample[];
}

// VoC Insights
export interface FeedbackInsight {
  id: string;
  sentiment_score: number;
  sentiment_label: 'positive' | 'negative' | 'neutral' | 'mixed';
  urgency_score: number;
  themes: Record<string, number> | string;
  narrative: string;
  churn_risk: number;
  period_start: string;
  period_end: string;
  created_at: string;
}

export interface InsightsListResponse {
  insights: FeedbackInsight[];
  total: number;
}

// Competitive Signals
export interface CompetitiveSignal {
  id: string;
  competitor_name: string;
  signal_type: string;
  signal_source: string;
  strategic_context: string;
  urgency: 'critical' | 'high' | 'medium' | 'low';
  detected_at: string;
  is_read: boolean;
}

export interface SignalsListResponse {
  signals: CompetitiveSignal[];
  total: number;
}

export interface SignalOverviewResponse {
  period: string;
  signals_7d: number;
  tracked_competitors: number;
  velocity: { day: string; label: string; count: number }[];
  competitors: { name: string; count: number }[];
  latest_context: string | null;
  share_of_voice?: Record<string, Record<string, number>>;
}

export interface AddTrackedCompetitorResponse {
  status: string;
  source_id: string;
  tracked_competitors: string[];
  analysis_queued: boolean;
}

// Journey Insights
export interface JourneyInsight {
  id: string;
  funnel_step: string;
  drop_off_rate: number;
  friction_score: number;
  friction_cause: 'ux_friction' | 'messaging' | 'expectation' | string;
  recommendation: string;
  projected_lift: number;
  created_at: string;
}

export interface JourneysListResponse {
  insights: JourneyInsight[];
  total: number;
}

// Data Sources
export interface DataSource {
  id: string;
  source_type: string;
  is_active: boolean;
  last_synced_at: string | null;
  created_at: string;
  connection_status: 'pending_configuration' | 'active' | 'failed' | 'disconnected';
  connection_error: string | null;
}

export interface DataSourcesListResponse {
  sources: DataSource[];
}

export interface CreateDataSourcePayload {
  source_type: string;
  credentials: Record<string, string>;
  config?: Record<string, unknown>;
}

// Reports
export interface Report {
  id: string;
  report_type: string;
  s3_key: string;
  period_start: string;
  period_end: string;
  created_at: string;
}

export interface ReportsListResponse {
  reports: Report[];
}

export interface ReportEditionStatsResponse {
  sources: number;
  signals: number;
  pages: number;
  volume: { day: string; signals: number }[];
}

export interface DeviceBreakdownResponse {
  devices: { device: string; count: number; pct: number }[];
}

// SSE Events
export interface InsightSSEEvent {
  event_type: 'insight';
  id: string;
  narrative: string;
  churn_risk: number;
  created_at: string;
}

export interface SignalSSEEvent {
  event_type: 'signal';
  id: string;
  competitor_name: string;
  signal_type: string;
  detected_at: string;
}

export interface JourneySSEEvent {
  event_type: 'journey';
  id: string;
  funnel_step: string;
  drop_off_rate: number;
  friction_cause: string;
  created_at: string;
}

export interface JobSSEEvent {
  event_type: 'job';
  id: string;
  job_type: 'voc' | 'comp_signal' | 'journey';
  status: 'succeeded' | 'failed' | 'dead';
  last_error: string | null;
  completed_at: string;
}

export type SSEEvent = InsightSSEEvent | SignalSSEEvent | JourneySSEEvent | JobSSEEvent;

// Pagination
export interface PaginationParams {
  limit?: number;
  offset?: number;
}

// Analysis responses
export interface AnalysisQueuedResponse {
  status: string;
  message: string;
}

// Team management (Phase 1)
export interface TeamMember {
  id: string;
  email: string;
  role: 'admin' | 'analyst' | 'viewer';
  created_at: string | null;
}

export interface TeamListResponse {
  users: TeamMember[];
}

export interface InviteResponse {
  status: string;
  email: string;
  role: string;
  expires_at: string;
  email_sent: boolean;
  accept_url?: string; // present in dev mode (no Resend domain)
}

export interface InviteLookupResponse {
  email: string;
  role: string;
  expires_at: string;
}

export interface CreateUserResponse {
  id: string;
  email: string;
  role: string;
}

// Agent jobs (Phase 6 — System panel)
export type AgentJobStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'dead';
export type AgentJobType = 'voc' | 'comp_signal' | 'journey';

export interface AgentJob {
  id: string;
  job_type: AgentJobType;
  status: AgentJobStatus;
  attempts: number;
  max_attempts: number;
  last_error: string | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  next_retry_at: string | null;
}

export interface AgentJobsResponse {
  jobs: AgentJob[];
}
