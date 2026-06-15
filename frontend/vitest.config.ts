import { defineConfig } from 'vitest/config';

// SR-05: frontend unit tests. Node environment is sufficient — the high-risk logic
// under test (JWT-expiry decode, API base-URL config) needs only atob/process.env/fetch,
// all available in Node 18+. Component-level (jsdom + Testing Library) coverage is a
// documented follow-up.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['lib/**/*.test.ts', 'app/**/*.test.ts'],
  },
});
