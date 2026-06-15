import { cookies } from 'next/headers';
import type { User } from './types';

const COOKIE_NAME = 'access_token';

// Server-side only — call from Server Components and Route Handlers
export function getTokenServerSide(): string | null {
  try {
    const cookieStore = cookies();
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

export async function getCurrentUser(token: string): Promise<User | null> {
  const baseUrl = process.env.API_URL_INTERNAL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000';
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
