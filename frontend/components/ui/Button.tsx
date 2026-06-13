import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Action button — reads as clickable (filled surface, hover lift).
 * Distinct from inputs, which read as empty wells.
 */
const button = cva(
  "inline-flex items-center justify-center gap-2 rounded-lg text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:pointer-events-none disabled:opacity-60",
  {
    variants: {
      variant: {
        primary: "bg-blue-600 text-white hover:bg-blue-500",
        default: "bg-slate-800 text-slate-100 hover:bg-slate-700",
        ghost: "bg-transparent text-slate-300 hover:bg-slate-800 hover:text-slate-100",
      },
      size: {
        sm: "h-8 px-3",
        md: "h-9 px-4",
        icon: "size-9",
      },
    },
    defaultVariants: { variant: "default", size: "md" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof button> {
  /** Shows a spinner and blocks interaction during async work (e.g. S3 fetch). */
  isLoading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, isLoading, disabled, children, ...props }, ref) => (
    <button
      ref={ref}
      disabled={disabled || isLoading}
      aria-busy={isLoading || undefined}
      className={cn(button({ variant, size }), className)}
      {...props}
    >
      {isLoading && <Loader2 className="size-4 shrink-0 animate-spin" />}
      {children}
    </button>
  ),
);
Button.displayName = "Button";
