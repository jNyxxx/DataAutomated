import * as React from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

/** Shared inset-well styling — the single source of truth for form controls. */
export const fieldWell =
  "rounded-lg bg-slate-950/50 text-sm text-slate-200 ring-1 ring-inset ring-slate-800 focus-within:ring-2 focus-within:ring-blue-500";

export function FieldLabel({ children }: { children: React.ReactNode }) {
  return <span className="mb-1.5 block text-xs font-medium text-slate-400">{children}</span>;
}

export function TextField({
  label,
  className,
  ...props
}: { label?: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block">
      {label && <FieldLabel>{label}</FieldLabel>}
      <input
        className={cn(
          fieldWell,
          "h-9 w-full px-3 outline-none placeholder:text-slate-500",
          className,
        )}
        {...props}
      />
    </label>
  );
}

export function SelectField({
  label,
  options,
  className,
  ...props
}: { label?: string; options: string[] } & React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <label className="block">
      {label && <FieldLabel>{label}</FieldLabel>}
      <div className={cn(fieldWell, "relative flex h-9 items-center")}>
        <select
          className={cn("h-full w-full appearance-none bg-transparent px-3 pr-8 text-sm text-slate-200 outline-none", className)}
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
    </label>
  );
}
