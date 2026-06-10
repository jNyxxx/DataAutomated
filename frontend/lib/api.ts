import type { DashboardSummary, Insight, Journey, Signal } from './types';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000';

export async function apiRequest<T>(path: string, token?: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    throw new Error(`API ${res.status} ${path}`);
  }
  return res.json() as Promise<T>;
}

export async function login(email: string, password: string): Promise<string> {
  const body = new URLSearchParams({ username: email, password });
  const res = await fetch(`${API_URL}/auth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  if (!res.ok) throw new Error('Invalid credentials');
  const data = await res.json() as { access_token: string };
  return data.access_token;
}

export async function fetchDashboardSummary(token: string): Promise<DashboardSummary> {
  return apiRequest<DashboardSummary>('/api/dashboard/summary', token);
}

export async function fetchLatestInsight(token: string): Promise<{ insight: Insight | null }> {
  return apiRequest<{ insight: Insight | null }>('/insights/latest', token);
}

export async function fetchSignals(token: string): Promise<{ signals: Signal[] }> {
  return apiRequest<{ signals: Signal[] }>('/signals/latest', token);
}

export async function fetchJourneys(token: string): Promise<{ insights: Journey[] }> {
  return apiRequest<{ insights: Journey[] }>('/journeys/latest', token);
}

export async function triggerAnalysis(
  agent: 'voc' | 'signals' | 'journey',
  token: string,
): Promise<{ status: string }> {
  const paths = {
    voc: '/insights/analyze',
    signals: '/signals/analyze',
    journey: '/journeys/analyze',
  };
  return apiRequest<{ status: string }>(paths[agent], token, { method: 'POST' });
}
