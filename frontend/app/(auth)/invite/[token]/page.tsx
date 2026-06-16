"use client";

import * as React from "react";
import { useParams, useRouter } from "next/navigation";
import { lookupInvite, acceptInvite } from "@/lib/api";
import type { InviteLookupResponse } from "@/lib/types";

export default function AcceptInvitePage() {
  const { token } = useParams<{ token: string }>();
  const router = useRouter();

  const [invite, setInvite] = React.useState<InviteLookupResponse | null>(null);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [password, setPassword] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [submitError, setSubmitError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!token) return;
    lookupInvite(token)
      .then(setInvite)
      .catch((err: Error) => setLoadError(err.message));
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);
    if (password !== confirm) {
      setSubmitError("Passwords do not match.");
      return;
    }
    setSubmitting(true);
    try {
      const result = await acceptInvite(token, password);
      // Set the access token cookie and send new users through onboarding
      document.cookie = `access_token=${result.access_token}; path=/; max-age=${60 * 60 * 24}; SameSite=Lax`;
      router.push("/onboarding");
    } catch (err: unknown) {
      setSubmitError(err instanceof Error ? err.message : "Failed to accept invite.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-900 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mb-4 inline-flex size-12 items-center justify-center rounded-xl bg-blue-500/10 text-blue-400">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className="size-6">
              <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-white">Join DataAutomated</h1>
          {invite && (
            <p className="mt-2 text-sm text-slate-400">
              Invited as <span className="font-medium text-slate-200">{invite.email}</span>
              {" · "}
              <span className="capitalize">{invite.role}</span>
            </p>
          )}
        </div>

        {loadError ? (
          <div className="rounded-lg bg-red-500/10 px-4 py-3 text-sm text-red-300 ring-1 ring-inset ring-red-500/20">
            {loadError === "Invite already accepted."
              ? "This invite has already been used. Try logging in."
              : loadError === "Invite has expired."
              ? "This invite link has expired. Ask your admin to send a new one."
              : loadError}
          </div>
        ) : !invite ? (
          <p className="text-center text-sm text-slate-500">Loading invite…</p>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-300">
                Email
              </label>
              <input
                type="email"
                value={invite.email}
                readOnly
                className="w-full rounded-lg bg-slate-800/60 px-3.5 py-2.5 text-sm text-slate-400 ring-1 ring-inset ring-slate-700"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-300">
                Create password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={12}
                placeholder="12+ chars, mixed case, digit, symbol"
                className="w-full rounded-lg bg-slate-800/60 px-3.5 py-2.5 text-sm text-white placeholder-slate-500 ring-1 ring-inset ring-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-300">
                Confirm password
              </label>
              <input
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
                placeholder="Repeat password"
                className="w-full rounded-lg bg-slate-800/60 px-3.5 py-2.5 text-sm text-white placeholder-slate-500 ring-1 ring-inset ring-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {submitError && (
              <p className="text-sm text-red-400">{submitError}</p>
            )}

            <button
              type="submit"
              disabled={submitting || !password || !confirm}
              className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            >
              {submitting ? "Creating account…" : "Accept & create account"}
            </button>
          </form>
        )}

        <p className="mt-6 text-center text-xs text-slate-600">
          DataAutomated · Invite-only access
        </p>
      </div>
    </div>
  );
}
