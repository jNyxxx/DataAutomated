import { formatDistanceToNow } from 'date-fns';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { JourneyInsight } from '@/lib/types';

interface JourneyCardProps {
  insight: JourneyInsight;
}

export function JourneyCard({ insight }: JourneyCardProps) {
  return (
    <Card className="hover:border-primary/50 transition-colors">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base capitalize">
            {insight.funnel_step.replace(/_/g, ' ')}
          </CardTitle>
          <Badge variant="secondary" className="text-xs capitalize">
            {insight.friction_cause.replace(/_/g, ' ')}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-3 mb-3">
          <div>
            <p className="text-xs text-muted-foreground">Drop-off Rate</p>
            <p className="text-xl font-bold text-destructive tabular-nums">
              {(insight.drop_off_rate * 100).toFixed(0)}%
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Projected Lift</p>
            <p className="text-xl font-bold text-green-400 tabular-nums">
              +{(insight.projected_lift * 100).toFixed(0)}%
            </p>
          </div>
        </div>
        <p className="text-sm text-muted-foreground line-clamp-2">{insight.recommendation}</p>
        <p className="text-xs text-muted-foreground mt-3">
          {formatDistanceToNow(new Date(insight.created_at), { addSuffix: true })}
        </p>
      </CardContent>
    </Card>
  );
}
