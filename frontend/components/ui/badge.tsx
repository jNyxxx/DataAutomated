import { type HTMLAttributes } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-primary text-primary-foreground',
        secondary: 'border-transparent bg-muted text-muted-foreground',
        destructive: 'border-transparent bg-destructive text-destructive-foreground',
        outline: 'text-foreground',
        positive: 'border-transparent bg-green-500/20 text-green-400',
        negative: 'border-transparent bg-red-500/20 text-red-400',
        warning: 'border-transparent bg-yellow-500/20 text-yellow-400',
        critical: 'border-transparent bg-red-600/20 text-red-300',
        high: 'border-transparent bg-orange-500/20 text-orange-400',
        medium: 'border-transparent bg-yellow-500/20 text-yellow-400',
        low: 'border-transparent bg-green-500/20 text-green-400',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);

export interface BadgeProps
  extends HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
