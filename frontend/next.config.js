/** @type {import('next').NextConfig} */
// `standalone` output enables the multi-stage node:20-alpine runtime image
// (CLAUDE.md §15, INFRASTRUCTURE_ARCHITECTURE.md §2).
const nextConfig = {
  output: 'standalone',
  reactStrictMode: true,
};

module.exports = nextConfig;
