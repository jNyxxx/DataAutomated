"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  ChevronRight,
  Loader2,
  Plus,
  Sparkles,
  Check,
} from "lucide-react";
import { AddConnectionModal } from "@/components/settings/AddConnectionModal";
import { Button } from "@/components/ui/button";
import { addCompetitorAction, triggerAllAnalysisAction } from "./actions";

const STEPS = [
  { id: 1, label: "Welcome" },
  { id: 2, label: "Connect" },
  { id: 3, label: "Competitors" },
  { id: 4, label: "Analyze" },
] as const;

function readTokenCookie(): string {
  if (typeof document === "undefined") return "";
  const m = document.cookie.match(/(?:^|;\s*)access_token=([^;]*)/);
  return m ? decodeURIComponent(m[1]) : "";
}

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = React.useState(1);
  const [orgName, setOrgName] = React.useState("");
  const [sourcesConnected, setSourcesConnected] = React.useState(0);
  const [competitors, setCompetitors] = React.useState<string[]>([]);
  const [competitorInput, setCompetitorInput] = React.useState("");
  const [addingCompetitor, setAddingCompetitor] = React.useState(false);
  const [competitorError, setCompetitorError] = React.useState<string | null>(null);
  const [analysisRunning, setAnalysisRunning] = React.useState(false);
  const [analysisDone, setAnalysisDone] = React.useState(false);

  React.useEffect(() => {
    const token = readTokenCookie();
    if (!token) return;
    const base = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
    fetch(`${base}/api/clients/me`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { name?: string } | null) => {
        if (d?.name) setOrgName(d.name);
      })
      .catch(() => {});
  }, []);

  function nextStep() {
    setStep((s) => Math.min(s + 1, 4));
  }

  async function handleAddCompetitor() {
    const name = competitorInput.trim();
    if (!name) return;
    setAddingCompetitor(true);
    setCompetitorError(null);
    try {
      const result = await addCompetitorAction(name);
      if (result.ok) {
        setCompetitors((prev) => [...prev, name]);
        setCompetitorInput("");
      } else {
        setCompetitorError(result.error ?? "Failed to add competitor");
      }
    } finally {
      setAddingCompetitor(false);
    }
  }

  async function handleRunAnalysis() {
    setAnalysisRunning(true);
    await triggerAllAnalysisAction();
    setAnalysisRunning(false);
    setAnalysisDone(true);
    setTimeout(() => router.push("/dashboard"), 1500);
  }

  return (
    <div className="flex min-h-[calc(100vh-4rem)] flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-lg">
        {/* Stepper */}
        <nav className="mb-10 flex items-start">
          {STEPS.map((s, i) => (
            <React.Fragment key={s.id}>
              <div className="flex flex-col items-center">
                <div
                  className={`grid size-8 place-items-center rounded-full text-xs font-semibold transition-colors ${
                    step > s.id
                      ? "bg-blue-600 text-white"
                      : step === s.id
                        ? "bg-blue-600 text-white ring-2 ring-blue-500/30 ring-offset-2 ring-offset-slate-900"
                        : "bg-slate-700 text-slate-400"
                  }`}
                >
                  {step > s.id ? <Check className="size-3.5" /> : s.id}
                </div>
                <span
                  className={`mt-1.5 text-xs ${step >= s.id ? "text-slate-200" : "text-slate-500"}`}
                >
                  {s.label}
                </span>
              </div>
              {i < STEPS.length - 1 && (
                <div
                  className={`mx-2 mt-4 h-px flex-1 transition-colors ${step > s.id ? "bg-blue-600" : "bg-slate-700"}`}
                />
              )}
            </React.Fragment>
          ))}
        </nav>

        {/* Panel */}
        <div className="rounded-2xl bg-slate-800 p-8 shadow-xl shadow-black/20 ring-1 ring-white/5">
          {/* ── Step 1: Welcome ── */}
          {step === 1 && (
            <div className="space-y-6">
              <div className="flex size-12 items-center justify-center rounded-xl bg-blue-500/10">
                <Sparkles className="size-6 text-blue-400" />
              </div>
              <div>
                <h1 className="text-2xl font-semibold text-white">
                  Welcome{orgName ? `, ${orgName}` : " to DataAutomated"}!
                </h1>
                <p className="mt-2 text-sm leading-relaxed text-slate-400">
                  Your intelligence platform is ready. This quick setup takes about 2 minutes —
                  connect a source, add competitors to track, and fire your first analysis.
                </p>
              </div>
              <ul className="space-y-2 rounded-xl bg-slate-900/50 px-4 py-3 text-sm">
                {[
                  "Connect a data source (Zendesk, Mixpanel, Shopify…)",
                  "Add competitors to monitor 24/7",
                  "Queue the VoC, Signals, and Journey agents",
                ].map((item, i) => (
                  <li key={i} className="flex items-center gap-2 text-slate-300">
                    <ChevronRight className="size-4 shrink-0 text-blue-400" />
                    {item}
                  </li>
                ))}
              </ul>
              <Button variant="primary" className="w-full justify-center" onClick={nextStep}>
                Get started <ChevronRight className="ml-1 size-4" />
              </Button>
            </div>
          )}

          {/* ── Step 2: Connect a source ── */}
          {step === 2 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-xl font-semibold text-white">Connect a data source</h2>
                <p className="mt-1 text-sm text-slate-400">
                  Link Zendesk, Intercom, Mixpanel, Shopify, or any other integration so the
                  agents have real data to analyze.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <AddConnectionModal onAdd={() => setSourcesConnected((n) => n + 1)} />
                {sourcesConnected > 0 && (
                  <span className="flex items-center gap-1.5 text-sm font-medium text-emerald-400">
                    <CheckCircle2 className="size-4" />
                    {sourcesConnected} source{sourcesConnected !== 1 ? "s" : ""} added
                  </span>
                )}
              </div>

              <p className="text-xs text-slate-500">
                You can add more sources later in{" "}
                <span className="text-slate-400">Settings → Integrations</span>.
              </p>

              <div className="flex items-center justify-between pt-1">
                <button
                  onClick={nextStep}
                  className="text-sm text-slate-400 hover:text-slate-200 focus:outline-none focus-visible:underline"
                >
                  Skip for now
                </button>
                <Button variant="primary" onClick={nextStep}>
                  Continue <ChevronRight className="ml-1 size-4" />
                </Button>
              </div>
            </div>
          )}

          {/* ── Step 3: Add competitors ── */}
          {step === 3 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-xl font-semibold text-white">Track competitors</h2>
                <p className="mt-1 text-sm text-slate-400">
                  The Competitive Signal agent monitors pricing moves, hiring, product launches,
                  and reviews across all added competitors — 24/7.
                </p>
              </div>

              <div className="flex gap-2">
                <input
                  type="text"
                  value={competitorInput}
                  onChange={(e) => setCompetitorInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleAddCompetitor();
                    }
                  }}
                  placeholder="e.g. Salesforce, HubSpot, Intercom…"
                  className="flex-1 rounded-lg bg-slate-900/60 px-3.5 py-2 text-sm text-white placeholder-slate-500 ring-1 ring-inset ring-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button
                  type="button"
                  onClick={handleAddCompetitor}
                  disabled={!competitorInput.trim() || addingCompetitor}
                  className="inline-flex h-[38px] items-center gap-1.5 rounded-lg bg-blue-600 px-3 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                >
                  {addingCompetitor ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Plus className="size-4" />
                  )}
                  Add
                </button>
              </div>

              {competitorError && (
                <p className="text-xs text-rose-400">{competitorError}</p>
              )}

              {competitors.length > 0 && (
                <ul className="space-y-1.5">
                  {competitors.map((c) => (
                    <li
                      key={c}
                      className="flex items-center gap-2 rounded-lg bg-slate-900/40 px-3 py-2 text-sm text-slate-200"
                    >
                      <CheckCircle2 className="size-4 shrink-0 text-emerald-400" />
                      {c}
                    </li>
                  ))}
                </ul>
              )}

              <div className="flex items-center justify-between pt-1">
                <button
                  onClick={nextStep}
                  className="text-sm text-slate-400 hover:text-slate-200 focus:outline-none focus-visible:underline"
                >
                  Skip for now
                </button>
                <Button variant="primary" onClick={nextStep}>
                  Continue <ChevronRight className="ml-1 size-4" />
                </Button>
              </div>
            </div>
          )}

          {/* ── Step 4: Run analysis ── */}
          {step === 4 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-xl font-semibold text-white">Run your first analysis</h2>
                <p className="mt-1 text-sm text-slate-400">
                  Queue all three intelligence agents at once — Voice of Customer, Competitive
                  Signals, and Behavioral Journey. They run in the background; results appear on
                  your dashboard.
                </p>
              </div>

              {analysisDone ? (
                <div className="flex flex-col items-center gap-3 py-4 text-center">
                  <CheckCircle2 className="size-12 text-emerald-400" />
                  <p className="text-sm font-medium text-white">
                    Agents queued — redirecting to your dashboard…
                  </p>
                </div>
              ) : (
                <Button
                  variant="primary"
                  className="w-full justify-center"
                  onClick={handleRunAnalysis}
                  disabled={analysisRunning}
                >
                  {analysisRunning ? (
                    <>
                      <Loader2 className="mr-2 size-4 animate-spin" />
                      Queueing agents…
                    </>
                  ) : (
                    <>
                      <Sparkles className="mr-2 size-4" />
                      Run all agents now
                    </>
                  )}
                </Button>
              )}

              {!analysisDone && (
                <div className="flex justify-center">
                  <button
                    onClick={() => router.push("/dashboard")}
                    className="text-sm text-slate-400 hover:text-slate-200 focus:outline-none focus-visible:underline"
                  >
                    Skip and go to dashboard
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        <p className="mt-6 text-center text-xs text-slate-600">
          DataAutomated · You can revisit any of these steps later in Settings
        </p>
      </div>
    </div>
  );
}
