import * as React from "react";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SourceRowMenu } from "@/components/settings/SourceRowMenu";
import { fetchDataSources } from "@/lib/api";
import { getTokenServerSide } from "@/lib/auth";
import { formatDistanceToNow } from "date-fns";
import { AddConnectionModal } from "@/components/settings/AddConnectionModal";

const STATUS_BADGE: Record<string, [string, BadgeProps["variant"]]> = {
  active: ["OK", "success"],
  pending_configuration: ["SYNCING", "info"],
  disconnected: ["STALE", "warning"],
  failed: ["ERROR", "critical"],
};

export default async function SettingsPage() {
  const token = getTokenServerSide()!;
  const dataSourcesResponse = await fetchDataSources(token).catch(() => ({ sources: [] }));
  const sources = dataSourcesResponse.sources;

  const errorCount = sources.filter((s) => s.connection_status === "failed" || s.connection_status === "disconnected").length;

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      {sources
        .filter((s) => s.connection_status === "failed" || s.connection_status === "disconnected")
        .map((s) => (
          <div key={s.id} role="alert" className="mb-6 flex items-center gap-3 bg-red-500/10 px-4 py-2.5 text-sm text-red-200 ring-1 ring-inset ring-red-500/20 rounded-lg">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className="size-4 shrink-0 text-red-400"><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4M12 17h.01"/></svg>
            <p className="min-w-0 flex-1 truncate capitalize">{s.name} connection {s.connection_status} — Data ingestion is paused.</p>
            <button className="shrink-0 rounded-md bg-red-500/15 px-2.5 py-1 text-xs font-medium text-red-200 hover:bg-red-500/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">Reconnect</button>
          </div>
        ))}

      {/* Header */}
      <header className="flex flex-wrap items-center gap-4">
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-semibold tracking-tight text-white">
            Settings & Data Sources
          </h1>
          <p className="mt-0.5 truncate text-sm text-slate-400">
            Acme SaaS Inc. · {sources.length} connected{errorCount > 0 ? ` · ${errorCount} needs attention` : ''}
          </p>
        </div>
      </header>

      {/* Connected sources */}
      <section className="mt-5 rounded-xl bg-slate-800 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)] p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="truncate text-sm font-semibold text-white">Connected sources</h2>
          <AddConnectionModal />
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
              {sources.map((s) => {
                const badgeInfo = STATUS_BADGE[s.connection_status] || ["UNKNOWN", "neutral"];
                const lastSync = s.last_synced_at ? `${formatDistanceToNow(new Date(s.last_synced_at))} ago` : "Never";
                
                return (
                  <tr key={s.id} className="hover:bg-slate-700/30 group transition-colors">
                    <td className="px-3 py-3 font-medium text-slate-100">{s.source_type}</td>
                    <td className="px-3 py-3 text-slate-400">{s.source_type}</td>
                    <td className="px-3 py-3">
                      <Badge variant={badgeInfo[1]} dot>
                        {badgeInfo[0]}
                      </Badge>
                    </td>
                    <td className="px-3 py-3 text-slate-400">{lastSync}</td>
                    <td className="px-3 py-3 text-right">
                      <SourceRowMenu sourceId={s.id} sourceName={s.source_type} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
