"use client";

import * as React from "react";
import { X } from "lucide-react";
import { CRED_FIELDS, PLATFORMS } from "@/components/settings/AddConnectionModal";
import { editSourceSettingsAction, resyncSourceAction } from "@/app/(dashboard)/settings/actions";
import { useToast } from "@/components/ui/Toast";
import { useRouter } from "next/navigation";

export function EditConnectionModal({
  sourceId,
  sourceType,
  sourceConfig,
  isOpen,
  onClose,
}: {
  sourceId: string;
  sourceType: string;
  sourceConfig: Record<string, string>;
  isOpen: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [fields, setFields] = React.useState<Record<string, string>>(sourceConfig || {});
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const selected = PLATFORMS.find((p) => p.id === sourceType);
  const defs = CRED_FIELDS[sourceType] ?? [];

  if (!isOpen || !selected) return null;

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const credentials: Record<string, string> = {};
      const config: Record<string, string> = {};

      for (const def of defs) {
        const raw = fields[def.key] ?? "";
        const value = raw.trim();
        // Allow empty credentials so we only update what's changed, but if it's required it should probably be filled?
        // Wait, if it's required and empty, they are trying to keep the old credential. 
        // Backend handles missing credentials by keeping the old ones if not provided.
        if (!value) continue;
        if (def.target === "config") {
          config[def.key] = value;
        } else {
          credentials[def.key] = value;
        }
      }

      await editSourceSettingsAction(sourceId, {
        credentials: Object.keys(credentials).length > 0 ? credentials : undefined,
        config: Object.keys(config).length > 0 ? config : undefined,
        is_active: true,
      });

      // trigger a resync to test the new credentials
      try {
        await resyncSourceAction(sourceId);
        toast(`${selected?.name} settings updated and connection tested`, "success");
      } catch (err) {
        toast(`${selected?.name} settings updated, but connection test failed`, "error");
      }

      onClose();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md overflow-hidden rounded-2xl bg-slate-800 shadow-2xl shadow-black/50 ring-1 ring-white/10 animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-white/10">
          <h3 className="text-base font-semibold text-white">Edit {selected.name} Settings</h3>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-700 hover:text-white focus:outline-none focus:ring-2 focus:ring-blue-500">
            <X className="size-5" />
          </button>
        </div>

        <form onSubmit={handleSave}>
          <div className="max-h-[60vh] overflow-y-auto px-5 py-4 space-y-4">
            {defs.map((f) => (
              <label key={f.key} className="block">
                <span className="mb-1.5 block text-xs font-medium text-slate-400">
                  {f.label}
                  {f.target !== "config" && " (Leave blank to keep current)"}
                </span>
                {f.textarea ? (
                  <textarea
                    required={f.target === "config" ? f.required : false}
                    rows={5}
                    value={fields[f.key] ?? ""}
                    onChange={(e) => setFields((prev) => ({ ...prev, [f.key]: e.target.value }))}
                    placeholder={f.target === "config" ? f.placeholder : "****************"}
                    className="w-full rounded-lg bg-slate-950/50 px-3 py-2 font-mono text-xs text-slate-200 ring-1 ring-inset ring-slate-800 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                ) : (
                  <input
                    required={f.target === "config" ? f.required : false}
                    value={fields[f.key] ?? ""}
                    onChange={(e) => setFields((prev) => ({ ...prev, [f.key]: e.target.value }))}
                    placeholder={f.target === "config" ? f.placeholder : "****************"}
                    className="h-9 w-full rounded-lg bg-slate-950/50 px-3 text-sm text-slate-200 ring-1 ring-inset ring-slate-800 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                )}
                {f.hint && <p className="mt-1 text-xs text-slate-500">{f.hint}</p>}
              </label>
            ))}
          </div>

          {error && (
            <div className="mx-5 mb-2 rounded-lg bg-rose-500/10 px-3 py-2 text-xs text-rose-300 ring-1 ring-inset ring-rose-500/20">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-2 bg-slate-900/40 px-5 py-4 border-t border-white/5">
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-9 items-center rounded-lg px-3 text-sm font-medium text-slate-300 hover:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="inline-flex h-9 items-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-medium text-white hover:bg-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
            >
              {loading ? (
                <>
                  <span className="inline-block size-4 rounded-full border-2 border-white/70 border-t-transparent animate-spin" />
                  Saving…
                </>
              ) : (
                "Save & Resync"
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
