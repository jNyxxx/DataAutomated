import * as React from "react";
import { Search, ChevronDown, Calendar } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Inputs read as *empty wells*: recessed surface + inset ring.
 * Deliberately the opposite of a Button so the affordance is unambiguous.
 */
const wellBase =
  "h-9 rounded-lg bg-slate-950/50 text-sm text-slate-200 placeholder:text-slate-500 ring-1 ring-inset ring-slate-800 focus-within:ring-2 focus-within:ring-blue-500";

export function SearchInput({
  className,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className={cn(wellBase, "flex items-center gap-2 px-3", className)}>
      <Search className="size-4 shrink-0 text-slate-500" />
      <input
        type="search"
        className="w-full min-w-0 bg-transparent outline-none placeholder:text-slate-500"
        {...props}
      />
    </label>
  );
}

interface FilterSelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  options: string[];
}

export function FilterSelect({ label, options, className, ...props }: FilterSelectProps) {
  return (
    <div
      className={cn(
        wellBase,
        "relative flex items-center focus-within:ring-2 focus-within:ring-blue-500",
        className,
      )}
    >
      {label && (
        <span className="pointer-events-none pl-3 text-sm text-slate-500">{label}:</span>
      )}
      <select
        className="h-full cursor-pointer appearance-none bg-transparent py-0 pl-1.5 pr-8 text-sm text-slate-200 outline-none focus-visible:outline-none"
        {...props}
      >
        {options.map((o) => (
          <option key={o} value={o} className="bg-slate-900 text-slate-200">
            {o}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2.5 size-4 text-slate-500" />
    </div>
  );
}

export function DateRangeButton({
  children = "Last 90 days",
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={cn(
        wellBase,
        "flex items-center gap-2 px-3 hover:ring-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500",
        className,
      )}
      {...props}
    >
      <Calendar className="size-4 text-slate-500" />
      {children}
      <ChevronDown className="size-4 text-slate-500" />
    </button>
  );
}
