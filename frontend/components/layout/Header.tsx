import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface HeaderProps {
  title: string;
  description?: string;
  actions?: ReactNode;
  className?: string;
}

export function Header({ title, description, actions, className }: HeaderProps) {
  return (
    <div className={cn('flex items-start justify-between mb-8', className)}>
      <div>
        <h1 className="text-2xl font-semibold text-foreground">{title}</h1>
        {description && (
          <p className="text-sm text-muted-foreground mt-1">{description}</p>
        )}
      </div>
      {actions && <div className="flex items-center gap-2 flex-shrink-0 ml-4">{actions}</div>}
    </div>
  );
}
