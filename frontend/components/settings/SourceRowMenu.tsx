"use client";

import * as React from "react";
import { MoreVertical, RefreshCw, Settings2, Trash2 } from "lucide-react";
import { cn, focusRing } from "@/lib/utils";
import { useToast } from "@/components/ui/Toast";

/**
 * Per-source ··· menu. The destructive "Disconnect" is a two-step guard:
 * first click arms ("Confirm disconnect?"), second click fires removal — so
 * an accidental click can never delete a data source.
 */
export function SourceRowMenu({
  sourceName,
  onDisconnect,
  onResync,
  onEdit,
}: {
  sourceName: string;
  onDisconnect: () => void;
  onResync?: () => void;
  onEdit?: () => void;
}) {
  const { toast } = useToast();
  const [open, setOpen] = React.useState(false);
  const [arming, setArming] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);

  // Reset the guard whenever the menu closes.
  React.useEffect(() => {
    if (!open) setArming(false);
  }, [open]);

  React.useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const handleDisconnect = () => {
    if (!arming) {
      setArming(true);
      return;
    }
    setOpen(false);
    onDisconnect();
    toast(`${sourceName} disconnected`, "info");
  };

  return (
    <div ref={ref} className="relative inline-block">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        className={cn("grid size-8 place-items-center rounded-lg text-slate-400 hover:bg-slate-700 hover:text-white", focusRing)}
      >
        <MoreVertical className="size-4" />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 z-30 mt-1 w-48 overflow-hidden rounded-xl border border-slate-700 bg-slate-800 py-1 shadow-xl shadow-black/40"
        >
          <button
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onResync?.();
              toast(`Re-syncing ${sourceName}…`, "info");
            }}
            className={cn("flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-slate-300 hover:bg-slate-700/60 hover:text-white", focusRing)}
          >
            <RefreshCw className="size-4 text-slate-400" />
            Re-sync now
          </button>
          <button
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onEdit?.();
            }}
            className={cn("flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-slate-300 hover:bg-slate-700/60 hover:text-white", focusRing)}
          >
            <Settings2 className="size-4 text-slate-400" />
            Edit settings
          </button>

          <div className="my-1 h-px bg-white/5" />

          {/* Two-step destructive guard */}
          <button
            role="menuitem"
            onClick={handleDisconnect}
            className={cn(
              "flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors",
              arming
                ? "bg-red-500/15 font-medium text-red-300"
                : "text-red-400 hover:bg-red-500/10",
              focusRing,
            )}
          >
            <Trash2 className="size-4" />
            {arming ? "Confirm disconnect?" : "Disconnect"}
          </button>
        </div>
      )}
    </div>
  );
}
