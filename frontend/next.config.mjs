/** @type {import('next').NextConfig} */

// P4-01: Content-Security-Policy + security headers on the frontend.
// connect-src must allow the backend API origin (REST + SSE). NEXT_PUBLIC_API_URL is
// available at build time; fall back to localhost for local dev only.
const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
const isDev = process.env.NODE_ENV !== 'production';

const csp = [
  "default-src 'self'",
  "frame-src 'self' blob:",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  // Next.js injects inline bootstrap; Recharts/Tailwind inject inline styles.
  "style-src 'self' 'unsafe-inline'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''}`,
  // REST fetches + EventSource (SSE) to the API; ws: for the dev HMR socket.
  `connect-src 'self' ${apiUrl}${isDev ? ' ws:' : ''}`,
].join('; ');

const securityHeaders = [
  { key: 'Content-Security-Policy', value: csp },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  // HSTS intentionally omitted while in no-domain HTTP mode (D-INTERIM-01);
  // add once TLS is terminated in front of the app.
];

const nextConfig = {
  output: 'standalone',
  async headers() {
    return [
      { source: '/:path*', headers: securityHeaders },
      {
        // The report file endpoint is loaded in an iframe for the in-app preview.
        // Override the site-wide frame-blocking headers to allow same-origin embedding.
        // The report HTML is self-contained (inline styles, no scripts, no external resources).
        source: '/api/reports/:id/file',
        headers: [
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          {
            key: 'Content-Security-Policy',
            value: "default-src 'none'; style-src 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; frame-ancestors 'self'",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
