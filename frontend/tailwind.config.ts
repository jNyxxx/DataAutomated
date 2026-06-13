import type { Config } from 'tailwindcss';

// Design system tokens — DataAutomated UI/UX overhaul (FRONTEND_ARCHITECTURE.md §3)
// Inspired by Linear, Vercel, PostHog: dark navy-first, glass-card surfaces, indigo accent
const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
    './hooks/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        // Brand accent (indigo-violet spectrum)
        brand: {
          50:  '#EEF2FF',
          100: '#E0E7FF',
          300: '#A5B4FC',
          400: '#818CF8',
          500: '#6366F1',   // PRIMARY
          600: '#4F46E5',
          700: '#4338CA',
          900: '#312E81',
        },
        violet: {
          400: '#A78BFA',
          500: '#8B5CF6',
          600: '#7C3AED',
        },
        cyan: {
          400: '#22D3EE',
          500: '#06B6D4',
        },
        // Layered dark surface system (elevation via lightness)
        surface: {
          base:     '#0A0E1A',   // deepest — page bg
          DEFAULT:  '#0F1629',   // sidebar / primary surface
          elevated: '#151E35',   // cards
          overlay:  '#1C2840',   // dropdowns / modals
          subtle:   '#1E2D4A',   // hover states
        },
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'Inter', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        '2xs': ['10px', { lineHeight: '14px', letterSpacing: '0.05em' }],
      },
      borderRadius: {
        card:   '12px',
        input:  '8px',
        badge:  '6px',
        button: '8px',
        modal:  '16px',
      },
      boxShadow: {
        card:   '0 2px 8px rgba(0,0,0,0.25), 0 0 0 1px rgba(148,163,184,0.06)',
        'card-hover': '0 8px 28px rgba(0,0,0,0.35), 0 0 0 1px rgba(99,102,241,0.2)',
        accent: '0 0 20px rgba(99,102,241,0.3)',
        glow:   '0 0 40px rgba(99,102,241,0.18), 0 0 80px rgba(139,92,246,0.08)',
        'inner-accent': 'inset 3px 0 0 #6366F1',
      },
      keyframes: {
        'fade-in-up': {
          '0%':   { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'fade-in': {
          '0%':   { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'slide-in-left': {
          '0%':   { opacity: '0', transform: 'translateX(-10px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        shimmer: {
          '0%':   { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        'pulse-dot': {
          '0%, 100%': { opacity: '1', transform: 'scale(1)' },
          '50%':      { opacity: '0.5', transform: 'scale(0.8)' },
        },
        'orb-drift': {
          '0%, 100%': { transform: 'translate(0, 0) scale(1)' },
          '33%':      { transform: 'translate(25px, -20px) scale(1.06)' },
          '66%':      { transform: 'translate(-18px, 14px) scale(0.96)' },
        },
        'spin-slow': {
          '0%':   { transform: 'rotate(0deg)' },
          '100%': { transform: 'rotate(360deg)' },
        },
      },
      animation: {
        'fade-in-up':     'fade-in-up 0.35s ease forwards',
        'fade-in':        'fade-in 0.2s ease forwards',
        'slide-in-left':  'slide-in-left 0.25s ease forwards',
        shimmer:          'shimmer 1.8s infinite linear',
        'pulse-dot':      'pulse-dot 1.6s ease-in-out infinite',
        'orb-drift':      'orb-drift 10s ease-in-out infinite',
        'spin-slow':      'spin-slow 3s linear infinite',
      },
    },
  },
  plugins: [],
};

export default config;
