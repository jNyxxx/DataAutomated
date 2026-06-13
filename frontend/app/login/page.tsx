'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Sparkles,
  Eye,
  EyeOff,
  BarChart3,
  Globe,
  Server,
  ArrowRight,
  TrendingUp,
  AlertCircle,
  Mail,
  Lock,
} from 'lucide-react';

const TRUST_STATS = [
  { label: 'Platform Uptime', value: '99.99%', icon: Server },
  { label: 'Feedback Parsed', value: '500K+', icon: BarChart3 },
  { label: 'Active Revenue Teams', value: '50+', icon: Globe },
];

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'voc' | 'signals' | 'journey'>('voc');

  // Handle standard credential login
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) {
        const status = res.status;
        if (status === 401 || status === 403) {
          setError('Invalid email or password. Please check your credentials and try again.');
        } else {
          setError('Sign-in failed — the server returned an unexpected error. Please try again.');
        }
        return;
      }
      router.push('/dashboard');
      router.refresh();
    } catch {
      setError('Could not reach the server. Check your connection or try again shortly.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-stretch relative overflow-hidden bg-[#070A13]">
      {/* ── Atmospheric Radial Glows ─────────────────── */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden select-none">
        <div
          className="absolute w-[600px] h-[600px] -left-[10%] top-[10%] opacity-40 blur-[130px]"
          style={{
            background: 'radial-gradient(circle, rgba(99,102,241,0.2) 0%, transparent 70%)',
          }}
        />
        <div
          className="absolute w-[500px] h-[500px] right-[5%] -top-[10%] opacity-30 blur-[110px]"
          style={{
            background: 'radial-gradient(circle, rgba(139,92,246,0.15) 0%, transparent 70%)',
          }}
        />
        <div
          className="absolute w-[450px] h-[450px] right-[20%] bottom-[5%] opacity-20 blur-[100px]"
          style={{
            background: 'radial-gradient(circle, rgba(6,182,212,0.1) 0%, transparent 70%)',
          }}
        />
        {/* Subtle grid background */}
        <div 
          className="absolute inset-0 opacity-[0.015]"
          style={{
            backgroundImage: `radial-gradient(rgba(255, 255, 255, 0.15) 1px, transparent 1px)`,
            backgroundSize: '24px 24px'
          }}
        />
      </div>

      {/* ── Left Side: Brand Showcase & Live Dashboard Preview ── */}
      <div className="hidden lg:flex flex-col justify-between w-[58%] xl:w-[62%] px-16 py-14 border-r border-slate-900 bg-gradient-to-b from-[#090D1A] to-[#05070D] relative z-10">
        
        {/* Top Header / Branding */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-gradient-to-br from-indigo-500 to-violet-600 shadow-md shadow-indigo-500/10">
            <Sparkles size={20} className="text-white" strokeWidth={2.5} />
          </div>
          <div>
            <div className="text-lg font-bold leading-none tracking-tight bg-gradient-to-r from-indigo-300 via-indigo-100 to-violet-300 bg-clip-text text-transparent">
              DataAutomated
            </div>
            <div className="text-xs text-slate-500 font-medium tracking-wide mt-0.5">
              Intelligence Platform
            </div>
          </div>
        </div>

        {/* Hero Section & Live Product Preview */}
        <div className="my-auto py-10 space-y-10 max-w-[620px]">
          <div className="space-y-4">
            <h1 className="text-4xl xl:text-5xl font-extrabold tracking-tight leading-[1.15] bg-gradient-to-br from-slate-50 via-slate-100 to-slate-400 bg-clip-text text-transparent">
              Strategic customer insights,<br />delivered instantly.
            </h1>
            <p className="text-base text-slate-400 leading-relaxed max-w-md">
              Synthesize support voice, monitor competitor dynamics, and analyze user journeys within a single unified control center.
            </p>
          </div>

          {/* Interactive Live Dashboard Preview Box */}
          <div className="rounded-2xl border border-slate-800/80 bg-slate-950/40 backdrop-blur-md overflow-hidden shadow-2xl shadow-black/80">
            {/* Mock Header Menu */}
            <div className="flex items-center justify-between border-b border-slate-900 px-5 py-3.5 bg-slate-950/60">
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-slate-800" />
                <span className="w-2.5 h-2.5 rounded-full bg-slate-800" />
                <span className="w-2.5 h-2.5 rounded-full bg-slate-800" />
                <span className="text-xs text-slate-500 font-medium ml-2">preview://dashboard-snapshot</span>
              </div>
              <div className="flex bg-slate-900/60 rounded-lg p-0.5">
                <button
                  onClick={() => setActiveTab('voc')}
                  className={`px-3 py-1 text-xs font-semibold rounded-md transition-all ${
                    activeTab === 'voc' ? 'bg-indigo-600/90 text-slate-100 shadow-sm' : 'text-slate-500 hover:text-slate-300'
                  }`}
                >
                  VoC Insights
                </button>
                <button
                  onClick={() => setActiveTab('signals')}
                  className={`px-3 py-1 text-xs font-semibold rounded-md transition-all ${
                    activeTab === 'signals' ? 'bg-indigo-600/90 text-slate-100 shadow-sm' : 'text-slate-500 hover:text-slate-300'
                  }`}
                >
                  Signals
                </button>
                <button
                  onClick={() => setActiveTab('journey')}
                  className={`px-3 py-1 text-xs font-semibold rounded-md transition-all ${
                    activeTab === 'journey' ? 'bg-indigo-600/90 text-slate-100 shadow-sm' : 'text-slate-500 hover:text-slate-300'
                  }`}
                >
                  Funnel
                </button>
              </div>
            </div>

            {/* Mock Dashboard Content Display */}
            <div className="p-6 min-h-[195px] flex flex-col justify-between">
              {activeTab === 'voc' && (
                <div className="space-y-4 animate-fade-in">
                  <div className="flex items-center gap-4">
                    <div className="bg-slate-900 border border-slate-800 px-4 py-2.5 rounded-xl">
                      <div className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Customer Sentiment</div>
                      <div className="text-lg font-bold text-emerald-400 mt-0.5 flex items-center gap-1">
                        0.72 <span className="text-xs text-emerald-500 font-medium">(Positive)</span>
                      </div>
                    </div>
                    <div className="bg-slate-900 border border-slate-800 px-4 py-2.5 rounded-xl">
                      <div className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Churn Risk Score</div>
                      <div className="text-lg font-bold text-slate-300 mt-0.5 flex items-center gap-1">
                        14.8% <span className="text-xs text-slate-500 font-medium">(Low)</span>
                      </div>
                    </div>
                    <div className="bg-indigo-950/20 border border-indigo-900/30 px-4 py-2.5 rounded-xl flex-1">
                      <div className="text-[10px] text-indigo-400 font-bold uppercase tracking-wider">Primary Theme</div>
                      <div className="text-sm font-bold text-slate-200 mt-0.5 truncate">Integration Friction</div>
                    </div>
                  </div>
                  <div className="bg-slate-900/40 border border-slate-900 p-4 rounded-xl">
                    <div className="text-xs text-slate-400 leading-relaxed italic">
                      &ldquo;Sentiment analysis highlights slight friction in onboarding. Customers are concerned with latency, but core retention signals remain extremely solid due to high feature stickiness.&rdquo;
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'signals' && (
                <div className="space-y-2.5 animate-fade-in">
                  <div className="flex items-center justify-between border-b border-slate-900/60 pb-1.5 text-[10px] text-slate-500 font-bold tracking-widest uppercase">
                    <span>Competitor</span>
                    <span>Activity Type</span>
                    <span>Urgency</span>
                  </div>
                  <div className="flex items-center justify-between py-1 border-b border-slate-900/30 text-xs">
                    <span className="font-semibold text-slate-300">Acme Corp</span>
                    <span className="text-slate-400">Dropped basic tier price by 15%</span>
                    <span className="badge border-red-500/20 bg-red-500/10 text-red-400 font-bold text-[9px] uppercase tracking-wider py-0.5 px-2">critical</span>
                  </div>
                  <div className="flex items-center justify-between py-1 border-b border-slate-900/30 text-xs">
                    <span className="font-semibold text-slate-300">Globex Co</span>
                    <span className="text-slate-400">Hiring 5 Enterprise Account Execs</span>
                    <span className="badge border-amber-500/20 bg-amber-500/10 text-amber-400 font-bold text-[9px] uppercase tracking-wider py-0.5 px-2">medium</span>
                  </div>
                  <div className="flex items-center justify-between py-1 text-xs">
                    <span className="font-semibold text-slate-300">Initech</span>
                    <span className="text-slate-400">Launched API Beta Sandbox</span>
                    <span className="badge border-blue-500/20 bg-blue-500/10 text-blue-400 font-bold text-[9px] uppercase tracking-wider py-0.5 px-2">low</span>
                  </div>
                </div>
              )}

              {activeTab === 'journey' && (
                <div className="space-y-4 animate-fade-in">
                  <div className="flex justify-between items-center text-xs text-slate-500 font-semibold mb-1">
                    <span>Funnel Progression</span>
                    <span className="flex items-center gap-1 text-indigo-400"><TrendingUp size={12} /> +4.2% projected lift</span>
                  </div>
                  <div className="grid grid-cols-4 gap-2.5 items-end h-[90px] pt-2">
                    <div className="space-y-2">
                      <div className="text-[10px] text-slate-500 text-center">1. Sign Up</div>
                      <div className="h-[65px] bg-indigo-600/30 border-t-2 border-indigo-500 rounded-t-md flex items-center justify-center text-xs font-bold text-indigo-200">100%</div>
                    </div>
                    <div className="space-y-2">
                      <div className="text-[10px] text-slate-500 text-center">2. Connect</div>
                      <div className="h-[48px] bg-indigo-600/50 border-t-2 border-indigo-400 rounded-t-md flex items-center justify-center text-xs font-bold text-indigo-100">74%</div>
                    </div>
                    <div className="space-y-2">
                      <div className="text-[10px] text-slate-500 text-center">3. Trigger</div>
                      <div className="h-[40px] bg-indigo-600/70 border-t-2 border-indigo-300 rounded-t-md flex items-center justify-center text-xs font-bold text-white">61%</div>
                    </div>
                    <div className="space-y-2">
                      <div className="text-[10px] text-slate-500 text-center">4. Dashboard</div>
                      <div className="h-[35px] bg-gradient-to-t from-violet-600 to-indigo-500 border-t-2 border-indigo-200 rounded-t-md flex items-center justify-center text-xs font-bold text-white">54%</div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Bottom Panel: Trust Badges & Metrics */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between border-t border-slate-900 pt-8 gap-6 sm:gap-0">
          {/* Real-time stats */}
          <div className="flex gap-8">
            {TRUST_STATS.map(({ label, value, icon: Icon }) => (
              <div key={label} className="space-y-1">
                <div className="text-[10px] text-slate-500 font-bold uppercase tracking-wider flex items-center gap-1.5 font-sans">
                  <Icon size={12} className="text-slate-500" />
                  {label}
                </div>
                <div className="text-sm font-bold text-slate-300">{value}</div>
              </div>
            ))}
          </div>

          {/* Compliance Logos */}
          <div className="flex items-center gap-3">
            {/* SOC 2 Badge */}
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-800/80 bg-slate-950/60 text-[9px] font-bold text-slate-400 tracking-wider uppercase select-none">
              <svg className="w-3.5 h-3.5 text-indigo-500" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z" />
              </svg>
              SOC 2 Type II
            </div>
            {/* GDPR Badge */}
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-800/80 bg-slate-950/60 text-[9px] font-bold text-slate-400 tracking-wider uppercase select-none">
              <svg className="w-3.5 h-3.5 text-indigo-500" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 22c5.52 0 10-4.48 10-10S17.52 2 12 2 2 6.48 2 12s4.48 10 10 10zm-1-15h2v2h-2V7zm0 4h2v6h-2v-6z" />
              </svg>
              GDPR Compliant
            </div>
          </div>
        </div>
      </div>

      {/* ── Right Side: Sleek Glassmorphic Login Form ── */}
      <div className="flex-1 flex flex-col justify-between px-6 sm:px-12 py-14 relative z-10 bg-[#070A13]">
        {/* Top Spacer/Empty (Matches layout height) */}
        <div className="hidden lg:block h-10" />

        {/* Mobile Header (Hidden on lg) */}
        <div className="lg:hidden flex items-center justify-between mb-8">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-gradient-to-br from-indigo-500 to-violet-600">
              <Sparkles size={16} className="text-white animate-pulse" />
            </div>
            <span className="text-base font-bold bg-gradient-to-r from-indigo-300 to-violet-300 bg-clip-text text-transparent">
              DataAutomated
            </span>
          </div>
        </div>

        {/* Centered Login Card */}
        <div className="w-full max-w-[400px] mx-auto my-auto space-y-7">
          <div className="space-y-1.5">
            <h2 className="text-2xl font-extrabold text-slate-100 tracking-tight">
              Welcome back
            </h2>
            <p className="text-sm text-slate-500 font-medium">
              Sign in to your B2B intelligence hub
            </p>
          </div>

          {/* Core Credentials Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Email Field */}
            <div className="space-y-2">
              <label 
                htmlFor="login-email" 
                className="text-xs text-slate-500 font-bold uppercase tracking-wider flex items-center gap-1.5 select-none"
              >
                <Mail size={12} className="text-slate-600" />
                Email address
              </label>
              <input
                id="login-email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@company.com"
                className="input-dark bg-slate-950/20 border-slate-800/80 hover:border-slate-700/60 focus:border-indigo-500/80 transition-all placeholder-slate-600"
              />
            </div>

            {/* Password Field */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label 
                  htmlFor="login-password" 
                  className="text-xs text-slate-500 font-bold uppercase tracking-wider flex items-center gap-1.5 select-none"
                >
                  <Lock size={12} className="text-slate-600" />
                  Password
                </label>
                <a 
                  href="mailto:hello@dataautomated.io?subject=Forgot%20Password"
                  className="text-[10px] font-bold text-slate-500 hover:text-indigo-400 transition-colors uppercase tracking-wider"
                >
                  Forgot?
                </a>
              </div>
              <div className="relative">
                <input
                  id="login-password"
                  type={showPw ? 'text' : 'password'}
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="input-dark pr-11 bg-slate-950/20 border-slate-800/80 hover:border-slate-700/60 focus:border-indigo-500/80 transition-all placeholder-slate-600"
                />
                <button
                  type="button"
                  onClick={() => setShowPw(!showPw)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-600 hover:text-slate-400 transition-colors"
                  aria-label={showPw ? 'Hide password' : 'Show password'}
                >
                  {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {/* Error Message */}
            {error && (
              <div className="flex items-start gap-2.5 p-3 rounded-lg bg-red-950/20 border border-red-900/30 text-xs text-red-400 leading-relaxed animate-fade-in">
                <AlertCircle size={14} className="shrink-0 text-red-400 mt-0.5" />
                <div>{error}</div>
              </div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 px-4 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-sm font-bold text-white transition-all shadow-lg shadow-indigo-600/10 hover:shadow-indigo-500/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 mt-4 active:scale-[0.99]"
            >
              {loading ? (
                <>
                  <svg className="animate-spin w-4 h-4 text-white" viewBox="0 0 24 24" fill="none">
                    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeOpacity="0.25" />
                    <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                  </svg>
                  Authenticating...
                </>
              ) : (
                <>
                  Sign in
                  <ArrowRight size={14} className="group-hover:translate-x-0.5 transition-transform" />
                </>
              )}
            </button>
          </form>

          {/* Magic Link Alternative Option */}
          <div className="text-center">
            <span className="text-xs text-slate-500 font-medium">
              Want passwordless access?{' '}
              <a
                href="mailto:hello@dataautomated.io?subject=Magic%20Link%20Request"
                className="text-xs text-indigo-400 hover:text-indigo-300 font-bold transition-colors"
              >
                Request a Magic Link
              </a>
            </span>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-slate-900/60 pt-6 mt-10 text-[10px] text-slate-500 font-medium tracking-wide select-none">
          <span>© {new Date().getFullYear()} DataAutomated.io</span>
          <a
            href="mailto:hello@dataautomated.io"
            className="hover:text-indigo-400 transition-colors"
          >
            Contact support
          </a>
        </div>
      </div>
    </div>
  );
}
