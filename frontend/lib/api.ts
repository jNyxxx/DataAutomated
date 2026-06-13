import type {
  AuthTokenResponse,
  User,
  DashboardSummary,
  FeedbackInsight,
  InsightsListResponse,
  CompetitiveSignal,
  SignalsListResponse,
  JourneysListResponse,
  DataSource,
  DataSourcesListResponse,
  CreateDataSourcePayload,
  ReportsListResponse,
  AnalysisQueuedResponse,
  PaginationParams,
} from './types';

function getBaseUrl(serverSide = false): string {
  if (serverSide && process.env.API_URL_INTERNAL) {
    return process.env.API_URL_INTERNAL;
  }
  return process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000';
}

export async function apiRequest<T>(
  path: string,
  options: RequestInit = {},
  token?: string,
  serverSide = false,
): Promise<T> {
  const base = getBaseUrl(serverSide);
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${base}${path}`, { ...options, headers });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = (await res.json()) as { detail?: string };
      detail = body.detail ?? detail;
    } catch { /* ignore */ }
    throw new Error(detail);
  }
  return res.json() as Promise<T>;
}

// Auth
export async function login(email: string, password: string): Promise<AuthTokenResponse> {
  const base = getBaseUrl(false);
  const body = new URLSearchParams({ username: email, password });
  const res = await fetch(`${base}/auth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({ detail: 'Login failed' }))) as { detail?: string };
    throw new Error(err.detail ?? 'Login failed');
  }
  return res.json() as Promise<AuthTokenResponse>;
}

export async function fetchCurrentUser(token: string): Promise<User> {
  return apiRequest<User>('/auth/me', { cache: 'no-store' }, token, true);
}

// Dashboard
export async function fetchDashboardSummary(token: string): Promise<DashboardSummary> {
  return apiRequest<DashboardSummary>('/api/dashboard/summary', { cache: 'no-store' }, token, true);
}

// VoC Insights
export async function fetchInsights(
  token: string,
  params?: PaginationParams,
): Promise<InsightsListResponse> {
  const qs = new URLSearchParams();
  if (params?.limit) qs.set('limit', String(params.limit));
  if (params?.offset) qs.set('offset', String(params.offset));
  const query = qs.toString() ? `?${qs}` : '';
  return apiRequest<InsightsListResponse>(`/insights/${query}`, { cache: 'no-store' }, token, true);
}

export async function fetchInsightById(token: string, id: string): Promise<FeedbackInsight> {
  const res = await apiRequest<{ insight: FeedbackInsight }>(
    `/insights/${id}`,
    { cache: 'no-store' },
    token,
    true,
  );
  return res.insight;
}

export async function triggerVoCAnalysis(token: string): Promise<AnalysisQueuedResponse> {
  return apiRequest<AnalysisQueuedResponse>('/insights/analyze', { method: 'POST' }, token, false);
}

// Competitive Signals
export async function fetchSignals(
  token: string,
  params?: PaginationParams,
): Promise<SignalsListResponse> {
  const qs = new URLSearchParams();
  if (params?.limit) qs.set('limit', String(params.limit));
  if (params?.offset) qs.set('offset', String(params.offset));
  const query = qs.toString() ? `?${qs}` : '';
  return apiRequest<SignalsListResponse>(`/signals/latest${query}`, { cache: 'no-store' }, token, true);
}

export async function fetchSignalById(token: string, id: string): Promise<CompetitiveSignal> {
  const res = await apiRequest<{ signal: CompetitiveSignal }>(
    `/signals/${id}`,
    { cache: 'no-store' },
    token,
    true,
  );
  return res.signal;
}

export async function markSignalRead(token: string, id: string): Promise<void> {
  await apiRequest<unknown>(`/signals/${id}/read`, { method: 'PATCH' }, token, false);
}

export async function triggerSignalAnalysis(token: string): Promise<AnalysisQueuedResponse> {
  return apiRequest<AnalysisQueuedResponse>('/signals/analyze', { method: 'POST' }, token, false);
}

// Journey Analytics
export async function fetchJourneys(
  token: string,
  params?: PaginationParams,
): Promise<JourneysListResponse> {
  const qs = new URLSearchParams();
  if (params?.limit) qs.set('limit', String(params.limit));
  if (params?.offset) qs.set('offset', String(params.offset));
  const query = qs.toString() ? `?${qs}` : '';
  return apiRequest<JourneysListResponse>(`/journeys/latest${query}`, { cache: 'no-store' }, token, true);
}

export async function triggerJourneyAnalysis(token: string): Promise<AnalysisQueuedResponse> {
  return apiRequest<AnalysisQueuedResponse>('/journeys/analyze', { method: 'POST' }, token, false);
}

// Reports
export async function fetchReports(token: string): Promise<ReportsListResponse> {
  return apiRequest<ReportsListResponse>('/api/reports/list', { cache: 'no-store' }, token, true);
}

export async function generateReport(
  token: string,
  reportType: string,
  period: string,
): Promise<{ status: string; report_id: string }> {
  return apiRequest(
    '/api/reports/generate',
    { method: 'POST', body: JSON.stringify({ report_type: reportType, period }) },
    token,
    false,
  );
}

export async function fetchReportDownloadUrl(token: string, id: string): Promise<{ url: string }> {
  return apiRequest<{ url: string }>(`/api/reports/${id}/download-url`, {}, token, false);
}

// Data Sources
export async function fetchDataSources(token: string): Promise<DataSourcesListResponse> {
  return apiRequest<DataSourcesListResponse>('/api/data-sources', { cache: 'no-store' }, token, true);
}

export async function createDataSource(
  token: string,
  payload: CreateDataSourcePayload,
): Promise<DataSource> {
  return apiRequest<DataSource>(
    '/api/data-sources',
    { method: 'POST', body: JSON.stringify(payload) },
    token,
    false,
  );
}

export async function updateDataSource(
  token: string,
  id: string,
  payload: Partial<CreateDataSourcePayload & { is_active: boolean }>,
): Promise<DataSource> {
  return apiRequest<DataSource>(
    `/api/data-sources/${id}`,
    { method: 'PATCH', body: JSON.stringify(payload) },
    token,
    false,
  );
}

export async function testDataSource(
  token: string,
  id: string,
): Promise<{ connection_status: string; message?: string; error?: string }> {
  return apiRequest(
    `/api/data-sources/${id}/test`,
    { method: 'POST' },
    token,
    false,
  );
}

export async function deleteDataSource(token: string, id: string): Promise<void> {
  await apiRequest<unknown>(`/api/data-sources/${id}`, { method: 'DELETE' }, token, false);
}
