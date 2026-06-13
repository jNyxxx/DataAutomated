import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface KPICardProps {
  label: string;
  value: number | null;
  format: 'score' | 'risk' | 'count';
  warning?: boolean;
}

function formatValue(value: number | null, format: 'score' | 'risk' | 'count'): string {
  if (value === null) return '—';
  if (format === 'score') return `${(value * 100).toFixed(0)}%`;
  if (format === 'risk') return `${(value * 100).toFixed(1)}%`;
  if (format === 'count') return value.toFixed(0);
  return String(value);
}

export function KPICard({ label, value, format, warning }: KPICardProps) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className={cn('text-3xl font-bold tabular-nums', warning && 'text-yellow-400')}>
          {formatValue(value, format)}
        </p>
        {warning && (
          <p className="text-xs text-yellow-400 mt-1">Above alert threshold (15%)</p>
        )}
      </CardContent>
    </Card>
  );
}
