'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { login } from '@/lib/api';
import { Sparkles, Eye, EyeOff, Zap, BarChart3, Shield } from 'lucide-react';

const FEATURES = [
  {
    icon: BarChart3,
    title: 'Voice-of-Customer Analysis',
    desc:  'AI-synthesized insights from every support ticket, review, and survey.',
  },
  {
    icon: Zap,
    title: 'Competitive Signal Intelligence',
    desc:  'Real-time alerts when competitors move — scraped, classified, and prioritized.',
  },
  {
    icon: Shield,
    title: 'Journey Intelligence',
    desc:  'Pinpoint exactly where customers drop off and why, with AI-generated playbooks.',
  },
];

export default function LoginPage() {
  const router   = useRouter();
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [showPw,   setShowPw]   = useState(false);
  const [error,    setError]    = useState('');
  const [loading,  setLoading]  = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const token = await login(email, password);
      document.cookie = `token=${encodeURIComponent(token)}; path=/; max-age=86400; samesite=strict`;
      router.push('/dashboard');
      router.refresh();
    } catch {
      setError('Invalid email or password. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="min-h-screen flex items-stretch relative overflow-hidden"
      style={{ background: '#0A0E1A' }}
    >
      {/* ── Atmospheric gradient orbs ─────────────────── */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        {/* Indigo orb — left center */}
        <div
          className="absolute animate-orb-drift"
          style={{
            width: 600,
            height: 600,
            left: '-10%',
            top: '20%',
            background: 'radial-gradient(ellipse, rgba(99,102,241,0.13) 0%, transparent 65%)',
            borderRadius: '50%',
            animationDelay: '0s',
          }}
        />
        {/* Violet orb — top right */}
        <div
          className="absolute"
          style={{
            width: 500,
            height: 500,
            right: '-5%',
            top: '-10%',
            background: 'radial-gradient(ellipse, rgba(139,92,246,0.10) 0%, transparent 65%)',
            borderRadius: '50%',
            animation: 'orb-drift 12s ease-in-out infinite reverse',
          }}
        />
        {/* Cyan orb — bottom right */}
        <div
          className="absolute"
          style={{
            width: 400,
            height: 400,
            right: '10%',
            bottom: '5%',
            background: 'radial-gradient(ellipse, rgba(6,182,212,0.07) 0%, transparent 65%)',
            borderRadius: '50%',
            animation: 'orb-drift 14s ease-in-out infinite',
            animationDelay: '4s',
          }}
        />
      </div>

      {/* ── Left panel — Branding ──────────────────────── */}
      <div className="hidden lg:flex flex-col justify-between w-[55%] px-16 py-14 relative">
        {/* Logo */}
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{ background: 'linear-gradient(135deg, #6366F1, #8B5CF6)' }}
          >
            <Sparkles size={20} className="text-white" strokeWidth={2.5} />
          </div>
          <div>
            <div
              className="text-base font-bold leading-none"
              style={{
                background: 'linear-gradient(120deg, #818CF8, #A78BFA)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
              }}
            >
              DataAutomated
            </div>
            <div className="text-xs mt-0.5" style={{ color: '#475569' }}>
              Intelligence Platform
            </div>
          </div>
        </div>

        {/* Hero copy */}
        <div className="space-y-8 max-w-md">
          <div>
            <h1
              className="text-4xl font-bold leading-tight mb-4"
              style={{
                background: 'linear-gradient(135deg, #F1F5F9 0%, #94A3B8 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
              }}
            >
              Intelligence,<br />automated.
            </h1>
            <p className="text-base leading-relaxed" style={{ color: '#64748B' }}>
              Turn raw customer data into strategic insight — from ticket to narrative in seconds.
            </p>
          </div>

          {/* Feature list */}
          <ul className="space-y-5">
            {FEATURES.map(({ icon: Icon, title, desc }) => (
              <li key={title} className="flex items-start gap-4">
                <div
                  className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
                  style={{
                    background: 'rgba(99,102,241,0.12)',
                    border: '1px solid rgba(99,102,241,0.20)',
                  }}
                >
                  <Icon size={16} style={{ color: '#818CF8' }} />
                </div>
                <div>
                  <div className="text-sm font-semibold mb-0.5" style={{ color: '#E2E8F0' }}>
                    {title}
                  </div>
                  <div className="text-xs leading-relaxed" style={{ color: '#475569' }}>
                    {desc}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>

        {/* Footer */}
        <div className="text-xs" style={{ color: '#334155' }}>
          © {new Date().getFullYear()} DataAutomated.io — Trusted by revenue teams worldwide.
        </div>
      </div>

      {/* ── Right panel — Login form ───────────────────── */}
      <div className="flex-1 flex items-center justify-center px-6 py-12 relative">
        <div
          className="w-full max-w-sm rounded-2xl p-9"
          style={{
            background: 'rgba(15, 22, 41, 0.80)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            border: '1px solid rgba(99,102,241,0.18)',
            boxShadow: '0 8px 48px rgba(0,0,0,0.5), 0 0 80px rgba(99,102,241,0.06)',
          }}
        >
          {/* Mobile logo (hidden on lg) */}
          <div className="lg:hidden flex items-center gap-2.5 mb-8">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center"
              style={{ background: 'linear-gradient(135deg, #6366F1, #8B5CF6)' }}
            >
              <Sparkles size={15} className="text-white" />
            </div>
            <span
              className="text-sm font-bold"
              style={{
                background: 'linear-gradient(120deg, #818CF8, #A78BFA)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
              }}
            >
              DataAutomated
            </span>
          </div>

          {/* Form header */}
          <div className="mb-8">
            <h2 className="text-xl font-bold mb-1" style={{ color: '#F1F5F9' }}>
              Welcome back
            </h2>
            <p className="text-sm" style={{ color: '#64748B' }}>
              Sign in to your intelligence portal
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Email */}
            <div>
              <label
                htmlFor="login-email"
                className="block text-xs font-semibold mb-2 uppercase tracking-wide"
                style={{ color: '#64748B' }}
              >
                Email address
              </label>
              <input
                id="login-email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input-dark"
                placeholder="you@company.com"
              />
            </div>

            {/* Password */}
            <div>
              <label
                htmlFor="login-password"
                className="block text-xs font-semibold mb-2 uppercase tracking-wide"
                style={{ color: '#64748B' }}
              >
                Password
              </label>
              <div className="relative">
                <input
                  id="login-password"
                  type={showPw ? 'text' : 'password'}
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="input-dark pr-11"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPw(!showPw)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 transition-colors"
                  style={{ color: '#475569' }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = '#94A3B8'; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = '#475569'; }}
                  aria-label={showPw ? 'Hide password' : 'Show password'}
                >
                  {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {/* Error */}
            {error && (
              <div
                className="flex items-center gap-2 text-sm rounded-lg px-3 py-2.5 animate-fade-in"
                style={{
                  background: 'rgba(239,68,68,0.10)',
                  border: '1px solid rgba(239,68,68,0.20)',
                  color: '#F87171',
                }}
              >
                <span className="shrink-0">⚠</span>
                {error}
              </div>
            )}

            {/* Submit */}
            <button
              id="login-submit"
              type="submit"
              disabled={loading}
              className="btn-gradient w-full py-2.5 text-sm flex items-center justify-center gap-2 mt-2"
            >
              {loading ? (
                <>
                  <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeOpacity="0.25" />
                    <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                  </svg>
                  Signing in…
                </>
              ) : (
                'Sign in'
              )}
            </button>
          </form>

          <p className="text-xs text-center mt-6" style={{ color: '#334155' }}>
            Need access?{' '}
            <a
              href="mailto:hello@dataautomated.io"
              className="transition-colors"
              style={{ color: '#818CF8' }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = '#A5B4FC'; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = '#818CF8'; }}
            >
              Contact us
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
