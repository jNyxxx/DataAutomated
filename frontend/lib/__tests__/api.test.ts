import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getBaseUrl, apiRequest, login } from '../api';

function fakeResponse(body: unknown, ok = true, statusText = 'OK'): Response {
  return {
    ok,
    status: ok ? 200 : 400,
    statusText,
    json: async () => body,
  } as unknown as Response;
}

function stubFetch(resp: Response) {
  const mock = vi.fn(async () => resp);
  vi.stubGlobal('fetch', mock);
  return mock;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('getBaseUrl', () => {
  it('returns NEXT_PUBLIC_API_URL when set', () => {
    vi.stubEnv('NEXT_PUBLIC_API_URL', 'https://api.example.com');
    expect(getBaseUrl()).toBe('https://api.example.com');
  });

  it('falls back to localhost in development when unset', () => {
    vi.stubEnv('NEXT_PUBLIC_API_URL', '');
    vi.stubEnv('NODE_ENV', 'development');
    expect(getBaseUrl()).toBe('http://localhost:8000');
  });

  it('throws in production when NEXT_PUBLIC_API_URL is unset (LB-05/09)', () => {
    vi.stubEnv('NEXT_PUBLIC_API_URL', '');
    vi.stubEnv('NODE_ENV', 'production');
    expect(() => getBaseUrl()).toThrow(/NEXT_PUBLIC_API_URL/);
  });
});

describe('apiRequest', () => {
  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_API_URL', 'https://api.example.com');
  });

  it('returns parsed JSON on a 2xx response', async () => {
    stubFetch(fakeResponse({ value: 42 }));
    await expect(apiRequest<{ value: number }>('/x')).resolves.toEqual({ value: 42 });
  });

  it('throws the server-provided detail on a non-2xx response', async () => {
    stubFetch(fakeResponse({ detail: 'boom' }, false, 'Bad Request'));
    await expect(apiRequest('/x')).rejects.toThrow('boom');
  });
});

describe('login', () => {
  it('posts form-urlencoded credentials and returns the token', async () => {
    vi.stubEnv('NEXT_PUBLIC_API_URL', 'https://api.example.com');
    const fetchMock = stubFetch(fakeResponse({ access_token: 't', token_type: 'bearer' }));
    const res = await login('a@b.com', 'pw');
    expect(res.access_token).toBe('t');
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.example.com/auth/token',
      expect.objectContaining({ method: 'POST' }),
    );
  });
});
