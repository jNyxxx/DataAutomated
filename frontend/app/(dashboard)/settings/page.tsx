import * as React from "react";
import { type Metadata } from "next";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { SourceRowMenu } from "@/components/settings/SourceRowMenu";
import { TestConnectionButton } from "@/components/settings/TestConnectionButton";
import { fetchDataSources, fetchClientInfo, fetchTeamMembers, fetchJobs } from "@/lib/api";
import { getTokenServerSide } from "@/lib/auth";
import { getCurrentUser } from "@/lib/auth";
import { Trash2, AlertCircle, RefreshCw } from "lucide-react";
import { LiveTime } from "@/components/ui/live-time";
import { LiveRefresh } from "@/components/ui/live-refresh";
import { AddConnectionModal } from "@/components/settings/AddConnectionModal";
import { resyncSourceAction, inviteTeamMemberAction, changeTeamMemberRoleAction } from "@/app/(dashboard)/settings/actions";
import { TeamSection } from "@/components/settings/TeamSection";
import { SystemPanel } from "@/components/settings/SystemPanel";

const STATUS_BADGE: Record<string, [string, BadgeProps["variant"]]> = {
  active: ["OK", "success"],
  pending_configuration: ["PENDING", "info"],
  disconnected: ["STALE", "warning"],
  failed: ["ERROR", "critical"],
};

export default async function SettingsPage() {
  const token = (await getTokenServerSide())!;
  const [dataSourcesResponse, clientInfo, teamResponse, currentUser, jobsResponse] = await Promise.all([
    fetchDataSources(token).catch(() => ({ sources: [] })),
    fetchClientInfo(token).catch(() => ({ name: "Your account", plan: "insight_starter", email: "" })),
    fetchTeamMembers(token, true).catch(() => ({ users: [] })),
    getCurrentUser(token).catch(() => null),
    fetchJobs(token, 20, true).catch(() => ({ jobs: [] })),
  ]);
  const sources = dataSourcesResponse.sources;

  const errorCount = sources.filter((s) => s.connection_status === "failed" || s.connection_status === "disconnected").length;

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <LiveRefresh intervalMs={15000} />
      {sources
        .filter((s) => s.connection_status === "failed" || s.connection_status === "disconnected")
        .map((s) => (
          <div key={s.id} role="alert" className="mb-6 flex items-center gap-3 bg-red-500/10 px-4 py-2.5 text-sm text-red-200 ring-1 ring-inset ring-red-500/20 rounded-lg">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className="size-4 shrink-0 text-red-400"><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4M12 17h.01"/></svg>
            <p className="min-w-0 flex-1 truncate capitalize">{s.source_type} connection {s.connection_status} — Data ingestion is paused.</p>
            <form action={resyncSourceAction.bind(null, s.id)}>
              <button type="submit" className="shrink-0 rounded-md bg-red-500/15 px-2.5 py-1 text-xs font-medium text-red-200 hover:bg-red-500/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">Reconnect</button>
            </form>
          </div>
        ))}

      {/* Header */}
      <header className="flex flex-wrap items-center gap-4">
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-semibold tracking-tight text-white">
            Settings & Data Sources
          </h1>
          <p className="mt-0.5 truncate text-sm text-slate-400">
            {clientInfo.name} · {sources.length} connected{errorCount > 0 ? ` · ${errorCount} needs attention` : ''}
          </p>
        </div>
      </header>

      {/* Connected sources */}
      <section className="mt-5 rounded-xl bg-slate-800 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)] p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="truncate text-sm font-semibold text-white">Connected sources</h2>
          {currentUser?.role === 'admin' && <AddConnectionModal />}
        </div>
        <div className="-mx-2 overflow-x-auto px-2">
          <table className="w-full min-w-[640px] border-separate border-spacing-0 text-sm">
            <thead>
              <tr className="text-left text-xs font-medium uppercase tracking-wider text-slate-400">
                <th className="px-3 py-2 font-medium">Source</th>
                <th className="px-3 py-2 font-medium">Type</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Last synced</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody className="[&>tr]:border-t [&>tr]:border-white/5">
              {sources.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-sm text-slate-400">
                    No data sources connected yet.{' '}
                    {currentUser?.role === 'admin'
                      ? 'Click "+ Add connection" to connect your first source.'
                      : 'Ask an admin to connect a data source.'}
                  </td>
                </tr>
              )}
              {sources.map((s) => {
                const badgeInfo = STATUS_BADGE[s.connection_status] || ["UNKNOWN", "neutral"];
                const lastSync = s.last_synced_at ? <LiveTime time={s.last_synced_at} /> : "Never";
                const needsTest = s.connection_status === "failed" || s.connection_status === "pending_configuration";

                return (
                  <React.Fragment key={s.id}>
                    <tr className="hover:bg-slate-700/30 group transition-colors">
                      <td className="px-3 py-3 font-medium text-slate-100 capitalize">{s.source_type.replace(/_/g, " ")}</td>
                      <td className="px-3 py-3 text-slate-400">{s.source_type}</td>
                      <td className="px-3 py-3">
                        <Badge variant={badgeInfo[1]} dot>
                          {badgeInfo[0]}
                        </Badge>
                      </td>
                      <td className="px-3 py-3 text-slate-400">{lastSync}</td>
                      <td className="px-3 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {needsTest && (
                            <TestConnectionButton
                              sourceId={s.id}
                              sourceName={s.source_type}
                              status={s.connection_status}
                            />
                          )}
                          <SourceRowMenu sourceId={s.id} sourceName={s.source_type} sourceConfig={s.config} />
                        </div>
                      </td>
                    </tr>
                    {s.connection_error && (
                      <tr className="!border-t-0">
                        <td colSpan={5} className="px-3 pb-3 pt-0">
                          <p className="rounded-md bg-red-500/8 px-3 py-2 text-xs text-red-300 ring-1 ring-inset ring-red-500/20">
                            <span className="font-medium">Error: </span>{s.connection_error}
                          </p>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
      {/* Team management */}
      <TeamSection
        members={teamResponse.users}
        currentUserId={currentUser?.id ?? ""}
        currentUserRole={currentUser?.role ?? "viewer"}
        onInvite={inviteTeamMemberAction}
        onChangeRole={changeTeamMemberRoleAction}
      />
      {/* System — agent job visibility (Phase 6) */}
      <SystemPanel jobs={jobsResponse.jobs} />
    </div>
  );
}
