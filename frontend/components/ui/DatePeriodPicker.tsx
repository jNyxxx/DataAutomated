"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Calendar, ChevronDown, Check } from "lucide-react";

const OPTIONS = [
  { value: "last_7_days",  label: "Last 7 days" },
  { value: "last_30_days", label: "Last 30 days" },
  { value: "last_90_days", label: "Last 90 days" },
  { value: "all_time",     label: "All time" },
];

export function DatePeriodPicker() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const current = searchParams.get("period") ?? "last_30_days";
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);

  const currentLabel = OPTIONS.find((o) => o.value === current)?.label ?? "Last 30 days";

  const pick = (value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("period", value);
    router.push(`/dashboard?${params.toString()}`);
    setOpen(false);
  };

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex h-9 items-center gap-2 rounded-lg bg-slate-950/50 px-3 text-sm text-slate-200 ring-1 ring-inset ring-slate-800 hover:ring-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
      >
        <Calendar className="size-4 text-slate-500" />
        <span>{currentLabel}</span>
        <ChevronDown className="size-4 text-slate-500" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <ul
            role="listbox"
            className="absolute right-0 z-20 mt-1 w-40 rounded-lg border border-white/10 bg-slate-800 py-1 shadow-xl"
          >
            {OPTIONS.map((o) => (
              <li key={o.value} role="option" aria-selected={current === o.value}>
                <button
                  onClick={() => pick(o.value)}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-slate-700/60 focus-visible:outline-none focus-visible:bg-slate-700/60"
                >
                  <span className="w-3.5 shrink-0">
                    {current === o.value && <Check className="size-3.5 text-blue-400" />}
                  </span>
                  <span className={current === o.value ? "text-blue-300" : "text-slate-200"}>
                    {o.label}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
