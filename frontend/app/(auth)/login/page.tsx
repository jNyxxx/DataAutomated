'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff, Settings } from 'lucide-react';

export default function LoginPage() {
  const [email, setEmail] = useState('demo@dataautomated.io');
  const [password, setPassword] = useState('supersecret24');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const router = useRouter();

  const [activeTab, setActiveTab] = useState<'voc' | 'signals' | 'funnel'>('voc');

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        setError(data.error ?? 'Login failed. Check your credentials.');
        return;
      }

      router.push('/dashboard');
      router.refresh();
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  const statCard = (dot: string, label: string, value: React.ReactNode, valueClass: string, qualifier: string) => (
    <div className="rounded-lg bg-slate-900/50 p-3 card-edge">
      <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest text-slate-500">
        <span className={`size-1.5 rounded-full ${dot}`}></span>{label}
      </p>
      <p className={`mt-1.5 truncate text-lg font-semibold tabular-nums ${valueClass}`}>
        {value}{qualifier ? <span className="text-xs font-normal text-slate-500"> {qualifier}</span> : ""}
      </p>
    </div>
  );

  const quoteBlock = (tint: string, tag: string, text: string) => (
    <div className="mt-4 rounded-lg bg-slate-900/50 p-3.5 card-edge">
      <div className={`mb-1.5 flex items-center gap-1.5 text-[11px] font-medium ${tint}`}>✦ {tag}</div>
      <p className="text-sm italic leading-relaxed text-slate-300">{text}</p>
    </div>
  );

  return (
    <>
      <style dangerouslySetInnerHTML={{__html: `
        :root{
          --accent:#2563eb; --accent-hover:#3b82f6; --accent-text:#60a5fa;
          --accent-ring:#3b82f6; --accent-soft:rgba(96,165,250,.16);
          --head-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
          --head-spacing:-0.02em;
        }
        .card-edge{ box-shadow: inset 0 1px 0 0 rgba(255,255,255,0.05); }
        .headline{ font-family: var(--head-family); letter-spacing: var(--head-spacing); }
        .text-accent{ color: var(--accent-text); }
        .btn-accent{ background: var(--accent); box-shadow: inset 0 1px 0 0 rgba(255,255,255,0.14); }
        .btn-accent:hover{ background: var(--accent-hover); }
        .tab-active{ background: var(--accent); color:#fff; }
        .well{ background: rgba(2,6,23,.5); box-shadow: inset 0 0 0 1px #1e293b; transition: box-shadow .15s; }
        .well:focus-within{ box-shadow: inset 0 0 0 2px var(--accent-ring); }
        .glow{ background:
            radial-gradient(52% 44% at 16% 20%, var(--accent-soft), transparent 64%),
            radial-gradient(40% 40% at 88% 86%, rgba(45,212,191,.05), transparent 70%);
        }
        @keyframes spin{to{transform:rotate(360deg)}}
        .spin{animation:spin .8s linear infinite;}
      `}} />
      <div className="h-full bg-slate-900 text-slate-200 antialiased min-h-screen flex flex-col relative">
        <div id="glow" className="glow pointer-events-none fixed inset-0"></div>

        <div className="relative z-10 flex min-h-screen flex-col">
          {/* ============ TOP BAR ============ */}
          <header className="flex items-center justify-between px-6 py-6 lg:px-12 lg:py-7">
            <div className="flex items-center gap-3">
              <span className="btn-accent grid size-9 shrink-0 place-items-center rounded-lg text-white">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className="size-5"><rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/></svg>
              </span>
              <span className="leading-tight">
                <span className="block text-base font-semibold tracking-tight text-white">Data<span className="text-accent">●</span>Automated</span>
                <span className="block text-xs text-slate-400">Intelligence Platform</span>
              </span>
            </div>
            <a href="#" className="fr hidden rounded-md px-1 text-sm text-slate-400 transition-colors hover:text-slate-200 sm:block">New here? <span className="text-accent font-medium">Start free →</span></a>
          </header>

          {/* ============ MAIN ============ */}
          <main className="grid flex-1 grid-cols-1 lg:grid-cols-[1.45fr_1fr]">

            {/* ---- LEFT: pitch + live preview ---- */}
            <section className="flex flex-col justify-center gap-9 px-6 py-10 lg:px-12 lg:py-12">
              <div>
                <h1 className="headline max-w-xl text-pretty text-4xl font-semibold leading-[1.08] text-white sm:text-5xl">Strategic customer insights, delivered instantly.</h1>
                <p className="mt-5 max-w-md text-base leading-relaxed text-slate-400">Synthesize support voice, monitor competitor dynamics, and analyze user journeys within a single unified control center.</p>
              </div>

              {/* live dashboard preview card */}
              <div className="card-edge w-full max-w-xl rounded-xl bg-slate-800">
                {/* chrome */}
                <div className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <div className="flex shrink-0 gap-1.5">
                    <span className="size-2.5 rounded-full bg-slate-600"></span>
                    <span className="size-2.5 rounded-full bg-slate-600"></span>
                    <span className="size-2.5 rounded-full bg-slate-600"></span>
                  </div>
                  <span className="font-mono text-xs text-slate-500">preview://dashboard-snapshot</span>
                  <div className="ml-auto flex items-center gap-1 rounded-lg bg-slate-900/60 p-1 text-xs font-medium">
                    <button onClick={() => setActiveTab('voc')} className={`fr rounded-md px-2.5 py-1 transition-colors ${activeTab === 'voc' ? 'tab-active' : 'text-slate-400 hover:text-slate-200'}`}>VoC Insights</button>
                    <button onClick={() => setActiveTab('signals')} className={`fr rounded-md px-2.5 py-1 transition-colors ${activeTab === 'signals' ? 'tab-active' : 'text-slate-400 hover:text-slate-200'}`}>Signals</button>
                    <button onClick={() => setActiveTab('funnel')} className={`fr rounded-md px-2.5 py-1 transition-colors ${activeTab === 'funnel' ? 'tab-active' : 'text-slate-400 hover:text-slate-200'}`}>Funnel</button>
                  </div>
                </div>
                <div className="h-px bg-white/5"></div>
                {/* body (swapped per tab) */}
                <div className="p-4">
                  {activeTab === 'voc' && (
                    <div className="grid grid-cols-3 gap-3">
                      {statCard("bg-teal-400","Customer sentiment",<span className="text-teal-400">0.72</span>,"text-white","(Positive)")}
                      {statCard("bg-teal-400","Churn risk score","14.8%","text-white","(Low)")}
                      {statCard("bg-teal-400","Primary theme",<span className="text-base">Integration Friction</span>,"text-white","")}
                      <div className="col-span-3">
                        {quoteBlock("text-teal-300","VoC summary","“Sentiment analysis highlights slight friction in onboarding. Customers note latency, but core retention signals remain extremely solid thanks to high feature stickiness.”")}
                      </div>
                    </div>
                  )}
                  {activeTab === 'signals' && (
                    <div className="grid grid-cols-3 gap-3">
                      {statCard("bg-rose-400","Critical open","1","text-rose-400","")}
                      {statCard("bg-rose-400","Signals · 7d","12","text-white","")}
                      {statCard("bg-rose-400","Top competitor",<span className="text-base">Northbeam</span>,"text-white","")}
                      <div className="col-span-3">
                        {quoteBlock("text-rose-300","Strategic context","“Northbeam cut Pro-tier pricing by 30% — direct pressure on mid-market deals. Expect price objections across active pipeline this quarter.”")}
                      </div>
                    </div>
                  )}
                  {activeTab === 'funnel' && (
                    <div className="grid grid-cols-3 gap-3">
                      {statCard("bg-blue-400","Top funnel drop",<span className="text-rose-400">54%</span>,"text-white","Checkout")}
                      {statCard("bg-blue-400","Revenue at risk",<span className="text-rose-400">$28K</span>,"text-white","/mo")}
                      {statCard("bg-blue-400","Affected sessions","3,084","text-white","")}
                      <div className="col-span-3">
                        {quoteBlock("text-blue-300","Friction diagnosis","“The biggest activation leak is mobile checkout (rage-clicks + input hesitation). Simplifying to a single screen models a +9% conversion lift.”")}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* stats + trust */}
              <div className="flex flex-col gap-6">
                <div className="grid grid-cols-3 gap-4 border-t border-white/[0.06] pt-6">
                  <div>
                    <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest text-slate-500"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" className="size-3.5 text-slate-500"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>Platform uptime</p>
                    <p className="mt-1 text-xl font-semibold tabular-nums text-white">99.99%</p>
                  </div>
                  <div>
                    <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest text-slate-500"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" className="size-3.5 text-slate-500"><path d="M3 3v18h18"/><rect x="7" y="11" width="3" height="6" rx="1"/><rect x="13" y="7" width="3" height="10" rx="1"/></svg>Feedback parsed</p>
                    <p className="mt-1 text-xl font-semibold tabular-nums text-white">500K+</p>
                  </div>
                  <div>
                    <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest text-slate-500"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" className="size-3.5 text-slate-500"><circle cx="12" cy="12" r="9"/><path d="M3.6 9h16.8M3.6 15h16.8M12 3a14 14 0 0 1 0 18 14 14 0 0 1 0-18Z"/></svg>Active revenue teams</p>
                    <p className="mt-1 text-xl font-semibold tabular-nums text-white">50+</p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <span className="card-edge inline-flex items-center gap-2 rounded-full bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-300">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" className="size-3.5 text-accent"><path d="M12 3 4 6v6c0 4.4 3.2 7.6 8 9 4.8-1.4 8-4.6 8-9V6l-8-3Z"/><path d="m9 12 2 2 4-4"/></svg>
                    SOC 2 Type II
                  </span>
                  <span className="card-edge inline-flex items-center gap-2 rounded-full bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-300">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" className="size-3.5 text-accent"><path d="M12 3 4 6v6c0 4.4 3.2 7.6 8 9 4.8-1.4 8-4.6 8-9V6l-8-3Z"/><path d="m9 12 2 2 4-4"/></svg>
                    GDPR Compliant
                  </span>
                </div>
              </div>
            </section>

            {/* ---- RIGHT: sign-in ---- */}
            <section className="flex items-center justify-center border-t border-white/[0.06] px-6 py-12 lg:border-l lg:border-t-0 lg:px-12">
              <div className="w-full max-w-sm">
                <h2 className="headline text-2xl font-semibold tracking-tight text-white">Welcome back</h2>
                <p className="mt-1.5 text-sm text-slate-400">Sign in to your B2B intelligence hub</p>

                <form id="signinForm" className="mt-8 space-y-5" noValidate onSubmit={handleSubmit}>
                  <div>
                    <label htmlFor="email" className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-widest text-slate-500">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" className="size-3.5"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg>Email address
                    </label>
                    <div className="well flex h-11 items-center rounded-lg px-3.5">
                      <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" className="w-full bg-transparent text-sm text-slate-200 outline-none placeholder:text-slate-500" />
                    </div>
                  </div>

                  <div>
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <label htmlFor="pw" className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-widest text-slate-500">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" className="size-3.5"><rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>Password
                      </label>
                      <a href="#" className="fr rounded text-[11px] font-semibold uppercase tracking-widest text-accent hover:opacity-80">Forgot?</a>
                    </div>
                    <div className="well flex h-11 items-center gap-2 rounded-lg px-3.5">
                      <input id="pw" type={showPassword ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" className="w-full bg-transparent text-sm text-slate-200 outline-none placeholder:text-slate-500" />
                      <button type="button" onClick={() => setShowPassword(!showPassword)} aria-label="Show password" className="fr grid size-7 shrink-0 place-items-center rounded text-slate-500 transition-colors hover:text-slate-300">
                        {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                  </div>

                  {error && (
                    <p className="text-sm text-rose-400" role="alert">
                      {error}
                    </p>
                  )}

                  <button id="signinBtn" type="submit" disabled={loading} className="btn-accent fr flex h-11 w-full items-center justify-center gap-2 rounded-lg text-sm font-semibold text-white transition-[transform,colors] duration-200 ease-out active:scale-95 disabled:pointer-events-none disabled:opacity-50">
                    <span data-label className="flex items-center gap-2">
                      {loading ? (
                        <>
                          <span className="inline-block size-4 rounded-full border-2 border-white/70 border-t-transparent spin"></span> Signing in…
                        </>
                      ) : (
                        <>
                          Sign in <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="size-4"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
                        </>
                      )}
                    </span>
                  </button>
                </form>

                <p className="mt-6 text-center text-sm text-slate-400">Want passwordless access? <a href="#" className="fr rounded font-medium text-accent hover:opacity-80">Request a Magic Link</a></p>
              </div>
            </section>
          </main>

          {/* ============ FOOTER ============ */}
          <footer className="flex flex-col gap-3 border-t border-white/[0.06] px-6 py-5 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between lg:px-12">
            <span>© 2026 DataAutomated.io</span>
            <a href="#" className="fr rounded text-slate-400 transition-colors hover:text-slate-200">Contact support</a>
          </footer>
        </div>
      </div>
    </>
  );
}
