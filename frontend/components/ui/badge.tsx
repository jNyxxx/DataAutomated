import React from 'react';
import { cn } from '@/lib/utils';

export const BADGE_STYLES = {
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
};

export const DOT_STYLES = {
  neutral: "bg-slate-400",
  success: "bg-green-400",
  warning: "bg-amber-400",
  critical: "bg-red-400",
  high: "bg-orange-400",
  info: "bg-sky-400",
  voc: "bg-teal-400",
  comp: "bg-rose-400",
  jrn: "bg-blue-400",
  system: "bg-slate-400",
};

export type BadgeVariant = keyof typeof BADGE_STYLES;

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  dot?: boolean;
}

export function Badge({ children, variant = 'neutral', dot = false, className, ...props }: BadgeProps) {
  return (
    <span 
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium leading-5 whitespace-nowrap",
        BADGE_STYLES[variant],
        className
      )}
      {...props}
    >
      {dot && <span className={cn("size-1.5 rounded-full", DOT_STYLES[variant])} />}
      {children}
    </span>
  );
}
