"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { MoreVertical, RefreshCw, Settings2, Trash2 } from "lucide-react";
import { cn, focusRing } from "@/lib/utils";
import { useToast } from "@/components/ui/Toast";

import { removeSourceAction, resyncSourceAction } from "@/app/(dashboard)/settings/actions";
import { EditConnectionModal } from "@/components/settings/EditConnectionModal";

/**
 * Per-source ··· menu. The destructive "Disconnect" is a two-step guard:
 * first click arms ("Confirm disconnect?"), second click fires removal — so
 * an accidental click can never delete a data source.
 */
export function SourceRowMenu({
  sourceId,
  sourceName,
  sourceConfig,
}: {
  sourceId: string;
  sourceName: string;
  sourceConfig?: Record<string, any>;
}) {
  const { toast } = useToast();
  const [open, setOpen] = React.useState(false);
  const [editModalOpen, setEditModalOpen] = React.useState(false);
  const [arming, setArming] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);

  const [coords, setCoords] = React.useState({ top: 0, left: 0 });

  // Reset the guard whenever the menu closes.
  React.useEffect(() => {
    if (!open) setArming(false);
  }, [open]);

  React.useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent | Event) => {
      // If we clicked inside the portal, don't close. 
      // Actually we attach the ref to the button, and another ref to the menu.
      if (ref.current && ref.current.contains(e.target as Node)) return;
      if (menuRef.current && menuRef.current.contains(e.target as Node)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("scroll", onDoc, true); // capture scroll to close
    window.addEventListener("resize", onDoc);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("scroll", onDoc, true);
      window.removeEventListener("resize", onDoc);
    };
  }, [open]);

  const handleOpen = (e: React.MouseEvent) => {
    if (open) {
      setOpen(false);
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    setCoords({
      top: rect.bottom,
      left: rect.right - 192, // 192px = w-48
    });
    setOpen(true);
  };

  const handleDisconnect = async () => {
    if (!arming) {
      setArming(true);
      return;
    }
    setOpen(false);
    setLoading(true);
    try {
      await removeSourceAction(sourceId);
      toast(`${sourceName} disconnected`, "success");
    } catch {
      toast(`Failed to disconnect ${sourceName}`, "error");
    } finally {
      setLoading(false);
    }
  };

  const handleResync = async () => {
    setOpen(false);
    setLoading(true);
    try {
      await resyncSourceAction(sourceId);
      toast(`Re-syncing ${sourceName}…`, "info");
    } catch {
      toast(`Failed to resync ${sourceName}`, "error");
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = () => {
    setOpen(false);
    setEditModalOpen(true);
  };

  const menuRef = React.useRef<HTMLDivElement>(null);

  return (
    <>
      <div ref={ref} className="relative inline-block">
        <button
          onClick={handleOpen}
          aria-haspopup="menu"
          aria-expanded={open}
          disabled={loading}
          className={cn("grid size-8 place-items-center rounded-lg text-slate-400 transition-[transform,colors] duration-200 ease-out active:scale-95 hover:bg-slate-700 hover:text-white disabled:opacity-50", focusRing)}
        >
          <MoreVertical className="size-4" />
        </button>
      </div>

      {open && typeof document !== "undefined" && createPortal(
        <div
          ref={menuRef}
          role="menu"
          style={{ top: coords.top + 4, left: coords.left }}
          className="fixed z-[100] w-48 overflow-hidden rounded-xl border border-slate-700 bg-slate-800 py-1 shadow-2xl shadow-black/60 animate-in fade-in zoom-in-95 duration-150"
        >
          <button
            role="menuitem"
            onClick={handleResync}
            className={cn("flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-slate-300 transition-[transform,colors] duration-200 ease-out active:scale-[0.98] hover:bg-slate-700/60 hover:text-white", focusRing)}
          >
            <RefreshCw className="size-4 text-slate-400" />
            Re-sync now
          </button>
          <button
            role="menuitem"
            onClick={handleEdit}
            className={cn("flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-slate-300 transition-[transform,colors] duration-200 ease-out active:scale-[0.98] hover:bg-slate-700/60 hover:text-white", focusRing)}
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
              "flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition-[transform,colors] duration-200 ease-out active:scale-[0.98]",
              arming
                ? "bg-red-500/15 font-medium text-red-300"
                : "text-red-400 hover:bg-red-500/10",
              focusRing,
            )}
          >
            <Trash2 className="size-4" />
            {arming ? "Confirm disconnect?" : "Disconnect"}
          </button>
        </div>,
        document.body
      )}

      {editModalOpen && (
        <EditConnectionModal
          sourceId={sourceId}
          sourceType={sourceName}
          sourceConfig={sourceConfig || {}}
          isOpen={editModalOpen}
          onClose={() => setEditModalOpen(false)}
        />
      )}
    </>
  );
}
