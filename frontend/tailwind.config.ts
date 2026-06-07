import type { Config } from 'tailwindcss';

// Tailwind is the approved styling layer (CLAUDE.md §3, §11).
const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {},
  },
  plugins: [],
};

export default config;
