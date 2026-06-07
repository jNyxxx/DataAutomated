// Typed API client — the single data-access path to the FastAPI backend
// (CLAUDE.md §11, FRONTEND_ARCHITECTURE.md §4). Every request sends a Bearer token;
// any non-OK response throws. Full surface (fetchDashboardSummary, fetchInsights,
// fetchSignals, triggerAnalysis, ...) is implemented in Phase 8.
//
// Auth note (D1): session/user management may be fronted by next-auth or Clerk, but the
// client_id-bearing JWT contract is fixed regardless (MULTI_TENANT_SECURITY.md §5).

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
    throw new Error(`API request failed: ${res.status} ${path}`);
  }
  return res.json() as Promise<T>;
}
