"use client";

import * as React from "react";
import { Check, Info, AlertTriangle, X } from "lucide-react";
import { cn } from "@/lib/utils";

type ToastVariant = "success" | "info" | "error";
interface ToastItem {
  id: number;
  message: string;
  variant: ToastVariant;
}

interface ToastContextValue {
  toast: (message: string, variant?: ToastVariant) => void;
}

const ToastContext = React.createContext<ToastContextValue | null>(null);

/** useToast() → toast("Saved", "success"). Wrap the app in <ToastProvider>. */
export function useToast() {
  const ctx = React.useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within <ToastProvider>");
  return ctx;
}

const ICON: Record<ToastVariant, React.ReactNode> = {
  success: <Check className="size-4 text-green-400" />,
  info: <Info className="size-4 text-sky-400" />,
  error: <AlertTriangle className="size-4 text-red-400" />,
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = React.useState<ToastItem[]>([]);
  const idRef = React.useRef(0);

  const remove = React.useCallback((id: number) => {
    setItems((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = React.useCallback(
    (message: string, variant: ToastVariant = "success") => {
      const id = ++idRef.current;
      setItems((prev) => [...prev, { id, message, variant }]);
      window.setTimeout(() => remove(id), 2800);
    },
    [remove],
  );

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      {/* Fixed, top of stacking order, bottom-right of viewport. */}
      <div className="pointer-events-none fixed bottom-5 right-5 z-[100] flex flex-col gap-2">
        {items.map((t) => (
          <Toast key={t.id} item={t} onClose={() => remove(t.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function Toast({ item, onClose }: { item: ToastItem; onClose: () => void }) {
  const [show, setShow] = React.useState(false);
  React.useEffect(() => {
    const r = requestAnimationFrame(() => setShow(true));
    return () => cancelAnimationFrame(r);
  }, []);

  return (
    <div
      role="status"
      className={cn(
        "pointer-events-auto flex items-center gap-2.5 rounded-xl border border-slate-700 bg-slate-800 px-4 py-3 text-sm text-slate-100 shadow-xl shadow-black/40",
        "transition-all duration-200 ease-out",
        show ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0",
      )}
    >
      <span className="grid size-5 place-items-center rounded-full bg-slate-700/60">
        {ICON[item.variant]}
      </span>
      <span className="min-w-0">{item.message}</span>
      <button
        onClick={onClose}
        className="ml-1 rounded p-0.5 text-slate-400 hover:text-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        aria-label="Dismiss"
      >
        <X className="size-3.5" />
      </button>
    </div>
  );
}
