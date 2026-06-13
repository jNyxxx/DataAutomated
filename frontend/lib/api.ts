import type { DashboardSummary, Insight, Journey, Signal } from './types';

// In the browser, NEXT_PUBLIC_API_URL is inlined at build time and must be
// host-reachable (http://localhost:8000). During SSR inside Docker, localhost
// is the frontend container itself — API_URL_INTERNAL (runtime env, e.g.
// http://backend:8000) points at the backend on the compose network.
const API_URL =
  typeof window === 'undefined'
    ? process.env.API_URL_INTERNAL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000'
    : process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000';

export async function apiRequest<T>(path: string, token?: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    cache: 'no-store',
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

// Login goes through the Next.js route handler /api/auth/login which sets an
// HttpOnly cookie — the raw JWT is never returned to browser JS (CLAUDE.md §14 P2.8).
export async function login(email: string, password: string): Promise<void> {
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error(`auth:${res.status}`);
}

export async function fetchDashboardSummary(token: string): Promise<DashboardSummary> {
  return apiRequest<DashboardSummary>('/api/dashboard/summary', token);
}

export async function fetchLatestInsight(token: string): Promise<{ insight: Insight | null }> {
  return apiRequest<{ insight: Insight | null }>('/insights/latest', token);
}

export async function fetchInsightsList(
  token: string,
  limit = 20,
  offset = 0,
): Promise<{ insights: Insight[]; total: number }> {
  return apiRequest<{ insights: Insight[]; total: number }>(
    `/insights/?limit=${limit}&offset=${offset}`,
    token,
  );
}

export async function fetchInsightById(token: string, id: string): Promise<{ insight: Insight | null }> {
  return apiRequest<{ insight: Insight | null }>(`/insights/${id}`, token);
}

export async function fetchSignals(
  token: string,
  limit = 20,
  offset = 0,
): Promise<{ signals: Signal[]; total: number }> {
  return apiRequest<{ signals: Signal[]; total: number }>(
    `/signals/latest?limit=${limit}&offset=${offset}`,
    token,
  );
}

export async function fetchJourneys(
  token: string,
  limit = 20,
  offset = 0,
): Promise<{ insights: Journey[]; total: number }> {
  return apiRequest<{ insights: Journey[]; total: number }>(
    `/journeys/latest?limit=${limit}&offset=${offset}`,
    token,
  );
}

export async function fetchSignalById(
  token: string,
  id: string,
): Promise<{ signal: Signal | null }> {
  return apiRequest<{ signal: Signal | null }>(`/signals/${id}`, token);
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
