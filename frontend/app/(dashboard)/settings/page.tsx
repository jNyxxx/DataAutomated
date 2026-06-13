import { cookies } from "next/headers";
import { Badge } from "@/components/ui/Badge";
import SettingsClient from "./settings-client";

interface BackendDataSource {
  id: string;
  source_type: string;
  connection_status: string;
  last_synced_at: string | null;
  is_active: boolean;
  connection_error?: string | null;
}

async function fetchSources(): Promise<BackendDataSource[]> {
  const cookieStore = await cookies();
  const token = cookieStore.get("token")?.value;
  const base =
    process.env.API_URL_INTERNAL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

  try {
    const res = await fetch(`${base}/api/data-sources`, {
      cache: "no-store",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) return [];
    return res.json() as Promise<BackendDataSource[]>;
  } catch {
    return [];
  }
}

function statusBadge(status: string) {
  if (status === "active") return <Badge variant="success" dot>Active</Badge>;
  if (status === "failed") return <Badge variant="critical" dot>Failed</Badge>;
  if (status === "testing") return <Badge variant="info" dot>Testing</Badge>;
  return <Badge variant="warning" dot>Pending setup</Badge>;
}

function formatSynced(ts: string | null): string {
  if (!ts) return "Never synced";
  const diff = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export default async function SettingsPage() {
  const sources = await fetchSources();

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 lg:px-8">
      <header className="flex flex-wrap items-center gap-4">
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-semibold tracking-tight text-white">
            Settings & Sources
          </h1>
          <p className="mt-0.5 text-sm text-slate-400">
            Manage data integrations and workspace configuration.
          </p>
        </div>
      </header>

      {/* Connected sources table */}
      <section className="mt-6">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-white">Connected integrations</h2>
          <span className="text-xs text-slate-400">{sources.length} source{sources.length !== 1 ? "s" : ""}</span>
        </div>

        <div className="overflow-hidden rounded-xl border border-slate-700/60 bg-slate-800 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)]">
          {sources.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-slate-400">
              No integrations connected yet. Add a source below to start ingesting data.
            </p>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-700/60">
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">
                    Source
                  </th>
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">
                    Status
                  </th>
                  <th className="hidden px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-400 sm:table-cell">
                    Last synced
                  </th>
                  <th className="px-3 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/40">
                {sources.map((src) => (
                  <tr key={src.id} className="group">
                    <td className="px-5 py-4">
                      <span className="text-sm font-medium text-slate-200">
                        {src.source_type.charAt(0).toUpperCase() + src.source_type.slice(1)}
                      </span>
                    </td>
                    <td className="px-5 py-4">{statusBadge(src.connection_status)}</td>
                    <td className="hidden px-5 py-4 text-sm text-slate-400 sm:table-cell">
                      {formatSynced(src.last_synced_at)}
                    </td>
                    <td className="px-3 py-4">
                      <SettingsClient sourceId={src.id} sourceName={src.source_type} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      {/* Add connection placeholder */}
      <section className="mt-6">
        <div className="rounded-xl border border-dashed border-slate-700 px-5 py-6 text-center">
          <p className="text-sm text-slate-400">
            To add a new integration, ask your administrator to configure it from the backend API,
            or use the data source management panel.
          </p>
        </div>
      </section>
    </div>
  );
}
