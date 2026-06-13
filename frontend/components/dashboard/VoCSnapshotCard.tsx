import Link from 'next/link';
import { Brain } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface VoCSnapshotCardProps {
  churnRisk: number | null;
}

export function VoCSnapshotCard({ churnRisk }: VoCSnapshotCardProps) {
  const isWarning = (churnRisk ?? 0) > 0.15;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Brain className="h-4 w-4 text-primary" />
          Voice of Customer
        </CardTitle>
      </CardHeader>
      <CardContent>
        {churnRisk !== null ? (
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-muted-foreground">Churn Risk</span>
              <span
                className={cn(
                  'text-sm font-semibold tabular-nums',
                  isWarning ? 'text-yellow-400' : 'text-green-400',
                )}
              >
                {(churnRisk * 100).toFixed(1)}%
              </span>
            </div>
            <div className="h-2 rounded-full bg-muted overflow-hidden">
              <div
                className={cn(
                  'h-full rounded-full transition-all',
                  isWarning ? 'bg-yellow-400' : 'bg-green-400',
                )}
                style={{ width: `${Math.min(churnRisk * 100, 100)}%` }}
              />
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No insights yet</p>
        )}
        <Link href="/insights" className="text-xs text-primary hover:underline mt-4 block">
          View all insights →
        </Link>
      </CardContent>
    </Card>
  );
}
