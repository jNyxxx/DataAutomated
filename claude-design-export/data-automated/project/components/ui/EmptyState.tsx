import * as React from "react";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

/**
 * Unified empty state. Use instead of placeholder/demo blocks when a data
 * set is genuinely unavailable (e.g. no behavioral source connected yet).
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-xl bg-slate-800 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)] px-6 py-10 text-center",
        className,
      )}
    >
      {Icon && (
        <span className="grid size-10 place-items-center rounded-full bg-slate-700/50 text-slate-400">
          <Icon className="size-5" />
        </span>
      )}
      <h3 className="mt-3 text-sm font-medium text-slate-200">{title}</h3>
      {description && (
        <p className="mt-1 max-w-sm text-sm leading-relaxed text-slate-400">{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
