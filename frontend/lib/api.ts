import type {
  AuthTokenResponse,
  User,
  DashboardSummary,
  FeedbackInsight,
  InsightsListResponse,
  FeedbackSamplesResponse,
  CompetitiveSignal,
  SignalsListResponse,
  SignalOverviewResponse,
  AddTrackedCompetitorResponse,
  JourneysListResponse,
  JourneyInsight,
  DataSource,
  DataSourcesListResponse,
  CreateDataSourcePayload,
  ReportsListResponse,
  ReportEditionStatsResponse,
  DeviceBreakdownResponse,
  AnalysisQueuedResponse,
  PaginationParams,
  TeamListResponse,
  InviteResponse,
  InviteLookupResponse,
  CreateUserResponse,
  AgentJobsResponse,
} from './types';

export function getBaseUrl(serverSide = false): string {
  if (serverSide && process.env.API_URL_INTERNAL) {
    return process.env.API_URL_INTERNAL;
  }
  const url = process.env.NEXT_PUBLIC_API_URL;
  if (url) return url;
  // LB-05/09: never silently fall back to localhost in production. A build or deploy
  // shipped without NEXT_PUBLIC_API_URL would otherwise point real users at their own
  // machine. Fail loudly instead; the Docker build also guards this at build time.
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'NEXT_PUBLIC_API_URL is not set — refusing to fall back to localhost in production.',
    );
  }
  return 'http://localhost:8000';
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
export async function fetchDashboardSummary(token: string, period = 'last_30_days'): Promise<DashboardSummary> {
  return apiRequest<DashboardSummary>(
    `/api/dashboard/summary?period=${encodeURIComponent(period)}`,
    { cache: 'no-store' },
    token,
    true,
  );
}

export async function fetchClientInfo(token: string): Promise<{ name: string; plan: string; email: string }> {
  return apiRequest<{ name: string; plan: string; email: string }>(
    '/api/clients/me',
    { cache: 'no-store' },
    token,
    true,
  );
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

export async function triggerVoCAnalysis(
  token: string,
  serverSide = false,
): Promise<AnalysisQueuedResponse> {
  return apiRequest<AnalysisQueuedResponse>('/insights/analyze', { method: 'POST' }, token, serverSide);
}

export async function fetchFeedbackSamples(
  token: string,
  params?: { limit?: number },
): Promise<FeedbackSamplesResponse> {
  const qs = new URLSearchParams();
  if (params?.limit) qs.set('limit', String(params.limit));
  const query = qs.toString() ? `?${qs}` : '';
  return apiRequest<FeedbackSamplesResponse>(`/insights/feedback-samples${query}`, { cache: 'no-store' }, token, true);
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

export async function fetchSignalOverview(
  token: string,
  period = 'last_14_days',
): Promise<SignalOverviewResponse> {
  return apiRequest<SignalOverviewResponse>(
    `/signals/overview?period=${encodeURIComponent(period)}`,
    { cache: 'no-store' },
    token,
    true,
  );
}

export async function addTrackedCompetitor(
  token: string,
  name: string,
  serverSide = false,
): Promise<AddTrackedCompetitorResponse> {
  return apiRequest<AddTrackedCompetitorResponse>(
    '/signals/competitors',
    { method: 'POST', body: JSON.stringify({ name }) },
    token,
    serverSide,
  );
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

export async function markSignalRead(token: string, id: string, serverSide = false): Promise<void> {
  await apiRequest<unknown>(`/signals/${id}/read`, { method: 'PATCH' }, token, serverSide);
}

export async function triggerSignalAnalysis(
  token: string,
  serverSide = false,
): Promise<AnalysisQueuedResponse> {
  return apiRequest<AnalysisQueuedResponse>('/signals/analyze', { method: 'POST' }, token, serverSide);
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

export async function triggerJourneyAnalysis(
  token: string,
  serverSide = false,
): Promise<AnalysisQueuedResponse> {
  return apiRequest<AnalysisQueuedResponse>('/journeys/analyze', { method: 'POST' }, token, serverSide);
}

export async function fetchJourneyById(token: string, id: string): Promise<JourneyInsight> {
  return apiRequest<JourneyInsight>(
    `/journeys/${id}`,
    { cache: 'no-store' },
    token,
    true,
  );
}

export async function fetchDeviceBreakdown(
  token: string,
  serverSide = false,
): Promise<DeviceBreakdownResponse> {
  return apiRequest<DeviceBreakdownResponse>(
    '/journeys/device-breakdown',
    { cache: 'no-store' },
    token,
    serverSide,
  );
}

// Reports
export async function fetchReports(token: string): Promise<ReportsListResponse> {
  return apiRequest<ReportsListResponse>('/api/reports/list', { cache: 'no-store' }, token, true);
}

export async function fetchEditionStats(
  token: string,
  period = 'last_7_days',
  serverSide = false,
): Promise<ReportEditionStatsResponse> {
  return apiRequest<ReportEditionStatsResponse>(
    `/api/reports/edition-stats?period=${encodeURIComponent(period)}`,
    { cache: 'no-store' },
    token,
    serverSide,
  );
}

export async function generateReport(
  token: string,
  reportType: string,
  period: string,
  serverSide = false,
): Promise<{ status: string; report_id: string }> {
  return apiRequest(
    '/api/reports/generate',
    { method: 'POST', body: JSON.stringify({ report_type: reportType, period }) },
    token,
    serverSide,
  );
}

export async function fetchReportDownloadUrl(
  token: string,
  id: string,
  serverSide = false,
  inline = false,
): Promise<{ url: string }> {
  const qs = inline ? "?inline=true" : "";
  return apiRequest<{ url: string }>(`/api/reports/${id}/download-url${qs}`, {}, token, serverSide);
}

// Data Sources
export async function fetchDataSources(token: string): Promise<DataSourcesListResponse> {
  return apiRequest<DataSourcesListResponse>('/api/data-sources', { cache: 'no-store' }, token, true);
}

export async function createDataSource(
  token: string,
  payload: CreateDataSourcePayload,
  serverSide = false,
): Promise<DataSource> {
  return apiRequest<DataSource>(
    '/api/data-sources',
    { method: 'POST', body: JSON.stringify(payload) },
    token,
    serverSide,
  );
}

export async function updateDataSource(
  token: string,
  id: string,
  payload: Partial<CreateDataSourcePayload & { is_active: boolean }>,
  serverSide = false,
): Promise<DataSource> {
  return apiRequest<DataSource>(
    `/api/data-sources/${id}`,
    { method: 'PATCH', body: JSON.stringify(payload) },
    token,
    serverSide,
  );
}

export async function testDataSource(
  token: string,
  id: string,
  serverSide = false,
): Promise<{ connection_status: string; message?: string; error?: string }> {
  return apiRequest(
    `/api/data-sources/${id}/test`,
    { method: 'POST' },
    token,
    serverSide,
  );
}

export async function deleteDataSource(token: string, id: string, serverSide = false): Promise<void> {
  await apiRequest<unknown>(`/api/data-sources/${id}`, { method: 'DELETE' }, token, serverSide);
}

// Team management (Phase 1)
export async function fetchTeamMembers(token: string, serverSide = false): Promise<TeamListResponse> {
  return apiRequest<TeamListResponse>('/auth/users', { cache: 'no-store' }, token, serverSide);
}

export async function createTeamMember(
  token: string,
  payload: { email: string; password: string; role: string },
  serverSide = false,
): Promise<CreateUserResponse> {
  return apiRequest<CreateUserResponse>('/auth/users', { method: 'POST', body: JSON.stringify(payload) }, token, serverSide);
}

export async function createInvite(
  token: string,
  payload: { email: string; role: string },
  serverSide = false,
): Promise<InviteResponse> {
  return apiRequest<InviteResponse>('/auth/invites', { method: 'POST', body: JSON.stringify(payload) }, token, serverSide);
}

export async function lookupInvite(token: string): Promise<InviteLookupResponse> {
  // No auth token needed — public endpoint
  return apiRequest<InviteLookupResponse>(`/auth/invites/${token}`, { cache: 'no-store' });
}

export async function acceptInvite(
  token: string,
  password: string,
): Promise<AuthTokenResponse> {
  return apiRequest<AuthTokenResponse>(
    `/auth/invites/${token}/accept`,
    { method: 'POST', body: JSON.stringify({ password }) },
  );
}

export async function updateTeamMemberRole(
  authToken: string,
  userId: string,
  role: string,
  serverSide = false,
): Promise<{ id: string; role: string }> {
  return apiRequest(
    `/auth/users/${userId}`,
    { method: 'PATCH', body: JSON.stringify({ role }) },
    authToken,
    serverSide,
  );
}

export async function updateOrgName(
  token: string,
  name: string,
  serverSide = false,
): Promise<{ name: string; email: string; plan: string }> {
  return apiRequest(
    '/auth/clients/me',
    { method: 'PATCH', body: JSON.stringify({ name }) },
    token,
    serverSide,
  );
}

// Agent jobs (Phase 6 — System panel)
export async function fetchJobs(token: string, limit = 20, serverSide = false): Promise<AgentJobsResponse> {
  return apiRequest<AgentJobsResponse>(`/api/ops/jobs?limit=${limit}`, { cache: 'no-store' }, token, serverSide);
}

export async function retryJob(token: string, jobId: string): Promise<{ status: string; job_id: string }> {
  return apiRequest(`/api/ops/jobs/${jobId}/retry`, { method: 'POST' }, token);
}
