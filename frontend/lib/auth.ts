import { cookies } from 'next/headers';
import type { User } from './types';

const COOKIE_NAME = 'access_token';

// Server-side only — call from Server Components and Route Handlers
export async function getTokenServerSide(): Promise<string | null> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(COOKIE_NAME)?.value ?? null;
    if (!token) return null;
    if (isTokenExpired(token)) return null;
    return token;
  } catch {
    // throws outside a request context (e.g. during static generation)
    return null;
  }
}

export function isTokenExpired(token: string): boolean {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    // Fail closed: a token with no (or a non-numeric) exp claim is treated as expired.
    if (typeof payload.exp !== 'number') return true;
    return payload.exp * 1000 < Date.now();
  } catch {
    return true;
  }
}

export function getUserRoleFromToken(token: string): 'admin' | 'analyst' | 'viewer' {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    const role = payload.role;
    if (role === 'admin' || role === 'analyst' || role === 'viewer') return role;
    return 'viewer'; // fail closed — least-privileged for unknown/missing role
  } catch {
    return 'viewer';
  }
}

export async function getCurrentUser(token: string): Promise<User | null> {
  const configured = process.env.API_URL_INTERNAL ?? process.env.NEXT_PUBLIC_API_URL;
  if (!configured && process.env.NODE_ENV === 'production') {
    throw new Error('API_URL_INTERNAL and NEXT_PUBLIC_API_URL are not set — refusing to fall back to localhost in production.');
  }
  const baseUrl = configured ?? 'http://localhost:8000';
  try {
    const res = await fetch(`${baseUrl}/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    });
    if (!res.ok) return null;
    return res.json() as Promise<User>;
  } catch {
    return null;
  }
}
