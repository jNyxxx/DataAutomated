import { describe, it, expect } from 'vitest';
import { isTokenExpired } from '../auth';

// Build a JWT-shaped string with the given payload (header/signature are dummies —
// isTokenExpired only base64-decodes the middle segment).
function makeToken(payload: Record<string, unknown>): string {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64');
  return `header.${body}.signature`;
}

describe('isTokenExpired', () => {
  it('returns false for a token whose exp is in the future', () => {
    const future = Math.floor(Date.now() / 1000) + 3600;
    expect(isTokenExpired(makeToken({ exp: future }))).toBe(false);
  });

  it('returns true for a token whose exp is in the past', () => {
    const past = Math.floor(Date.now() / 1000) - 3600;
    expect(isTokenExpired(makeToken({ exp: past }))).toBe(true);
  });

  it('returns true for a malformed token', () => {
    expect(isTokenExpired('not-a-jwt')).toBe(true);
  });

  it('returns true when the payload has no exp claim', () => {
    expect(isTokenExpired(makeToken({ sub: 'abc' }))).toBe(true);
  });
});
