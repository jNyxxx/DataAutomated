import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/**
 * Unified Badge.
 * Semantic, soft-filled tints — no hard outlines.
 * Status:  success | warning | critical | high | info | neutral
 * Streams: voc | comp | jrn | system  (render a leading dot)
 */
const badge = cva(
  "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium leading-5 whitespace-nowrap",
  {
    variants: {
      variant: {
        neutral: "bg-slate-700/40 text-slate-300",
        success: "bg-green-500/10 text-green-400",
        warning: "bg-amber-500/10 text-amber-400",
        critical: "bg-red-500/10 text-red-400",
        high: "bg-orange-500/10 text-orange-400",
        info: "bg-sky-500/10 text-sky-400",
        voc: "bg-teal-500/10 text-teal-300",
        comp: "bg-rose-500/10 text-rose-300",
        jrn: "bg-blue-500/10 text-blue-300",
        system: "bg-slate-500/15 text-slate-300",
      },
    },
    defaultVariants: { variant: "neutral" },
  },
);

const DOT: Partial<Record<NonNullable<VariantProps<typeof badge>["variant"]>, string>> = {
  voc: "bg-teal-400",
  comp: "bg-rose-400",
  jrn: "bg-blue-400",
  system: "bg-slate-400",
  success: "bg-green-400",
  warning: "bg-amber-400",
  critical: "bg-red-400",
  high: "bg-orange-400",
};

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badge> {
  /** Render a small leading status/stream dot. */
  dot?: boolean;
}

export function Badge({ className, variant, dot, children, ...props }: BadgeProps) {
  return (
    <span className={cn(badge({ variant }), className)} {...props}>
      {dot && (
        <span
          className={cn("size-1.5 rounded-full", variant ? DOT[variant] : "bg-slate-400")}
          aria-hidden
        />
      )}
      {children}
    </span>
  );
}
