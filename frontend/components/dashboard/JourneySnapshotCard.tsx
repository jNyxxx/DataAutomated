import Link from 'next/link';
import { Route } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface JourneySnapshotCardProps {
  funnelStep: string | null;
  dropOffRate: number | null;
}

export function JourneySnapshotCard({ funnelStep, dropOffRate }: JourneySnapshotCardProps) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Route className="h-4 w-4 text-primary" />
          Behavioral Journeys
        </CardTitle>
      </CardHeader>
      <CardContent>
        {funnelStep ? (
          <div>
            <p className="text-sm text-muted-foreground">Top drop-off at</p>
            <p className="font-semibold capitalize mt-1">
              {funnelStep.replace(/_/g, ' ')}
            </p>
            {dropOffRate !== null && (
              <p className="text-2xl font-bold text-destructive mt-2 tabular-nums">
                {(dropOffRate * 100).toFixed(0)}% drop-off
              </p>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No journey data yet</p>
        )}
        <Link href="/journeys" className="text-xs text-primary hover:underline mt-4 block">
          View all journeys →
        </Link>
      </CardContent>
    </Card>
  );
}
