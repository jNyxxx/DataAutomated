"use client";

import * as React from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * useMountTransition — keeps a component mounted through its exit animation.
 * `mounted` controls presence in the DOM; `visible` flips one frame later so
 * CSS transitions run on enter, and flips off (then unmounts after `duration`)
 * on exit.
 */
function useMountTransition(open: boolean, duration = 300) {
  const [mounted, setMounted] = React.useState(open);
  const [visible, setVisible] = React.useState(false);

  React.useEffect(() => {
    let raf = 0;
    let timer = 0;
    if (open) {
      setMounted(true);
      raf = requestAnimationFrame(() => requestAnimationFrame(() => setVisible(true)));
    } else {
      setVisible(false);
      timer = window.setTimeout(() => setMounted(false), duration);
    }
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(timer);
    };
  }, [open, duration]);

  return { mounted, visible };
}

/** Shared backdrop with a fluid opacity fade. */
function Backdrop({ visible, onClick }: { visible: boolean; onClick: () => void }) {
  return (
    <div
      onClick={onClick}
      className={cn(
        "absolute inset-0 bg-black/50 backdrop-blur-sm",
        "transition-opacity duration-200 ease-in-out",
        visible ? "opacity-100" : "opacity-0",
      )}
    />
  );
}

function useEscClose(open: boolean, onClose: () => void) {
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);
}

/* -------------------------------- Modal --------------------------------- */

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  className,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
}) {
  const { mounted, visible } = useMountTransition(open, 200);
  useEscClose(open, onClose);
  if (!mounted) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal>
      <Backdrop visible={visible} onClick={onClose} />
      <div
        className={cn(
          "relative z-10 w-full max-w-md overflow-hidden rounded-2xl bg-slate-800 shadow-2xl shadow-black/50 ring-1 ring-white/10",
          "transition-all duration-200 ease-in-out",
          visible ? "scale-100 opacity-100" : "scale-95 opacity-0",
          className,
        )}
      >
        <div className="flex items-center justify-between gap-3 px-5 py-4">
          <h3 className="text-base font-semibold text-white">{title}</h3>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-700 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            aria-label="Close"
          >
            <X className="size-5" />
          </button>
        </div>
        <div className="px-5 pb-5">{children}</div>
        {footer && (
          <div className="flex justify-end gap-2 bg-slate-900/40 px-5 py-4">{footer}</div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------ SlideOver ------------------------------- */

export function SlideOver({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  const { mounted, visible } = useMountTransition(open, 300);
  useEscClose(open, onClose);
  if (!mounted) return null;

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal>
      <Backdrop visible={visible} onClick={onClose} />
      <div
        className={cn(
          "absolute right-0 top-0 flex h-full w-full max-w-md flex-col bg-slate-800 shadow-2xl shadow-black/50 ring-1 ring-white/10",
          "transform transition-transform duration-300 ease-in-out",
          visible ? "translate-x-0" : "translate-x-full",
        )}
      >
        <div className="flex items-start justify-between gap-3 px-5 py-4">
          <div className="min-w-0">
            <h3 className="text-base font-semibold text-white">{title}</h3>
            {subtitle && <p className="mt-0.5 text-sm text-slate-400">{subtitle}</p>}
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-700 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            aria-label="Close"
          >
            <X className="size-5" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-2">{children}</div>
        {footer && (
          <div className="flex justify-end gap-2 bg-slate-900/40 px-5 py-4">{footer}</div>
        )}
      </div>
    </div>
  );
}
