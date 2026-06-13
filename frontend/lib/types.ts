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
export interface DashboardSummary {
  sentiment_score: number | null;
  churn_risk: number | null;
  unread_signals: number | null;
  latest_funnel_step: string | null;
  latest_drop_off_rate: number | null;
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

export type SSEEvent = InsightSSEEvent | SignalSSEEvent | JourneySSEEvent;

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
