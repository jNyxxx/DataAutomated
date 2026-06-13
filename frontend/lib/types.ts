export interface DashboardSummary {
  sentiment_score: number | null;
  churn_risk: number | null;
  unread_signals: number;
  latest_funnel_step: string | null;
  latest_drop_off_rate: number | null;
}

export interface Insight {
  id: string;
  sentiment_score: string | null;
  sentiment_label: string | null;
  urgency_score: string | null;
  themes: string | null;
  narrative: string | null;
  churn_risk: string | null;
  period_start: string | null;
  period_end: string | null;
  created_at: string;
}

export interface Signal {
  id: string;
  competitor_name: string | null;
  signal_type: string | null;
  signal_source: string | null;
  strategic_context: string | null;
  urgency: 'critical' | 'high' | 'medium' | 'low' | null;
  detected_at: string | null;
  is_read: boolean | null;
}

export interface Journey {
  id: string;
  funnel_step: string | null;
  drop_off_rate: string | null;
  friction_score: string | null;
  friction_cause: 'ux_friction' | 'messaging' | 'expectation' | null;
  recommendation: string | null;
  projected_lift: string | null;
  created_at: string;
}

export interface SseInsightEvent {
  id: string;
  narrative: string | null;
  churn_risk: string | null;
  created_at: string;
}
