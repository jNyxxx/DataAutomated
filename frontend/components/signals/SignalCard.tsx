import Link from 'next/link';
import { formatDistanceToNow } from 'date-fns';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { CompetitiveSignal } from '@/lib/types';

interface SignalCardProps {
  signal: CompetitiveSignal;
}

export function SignalCard({ signal }: SignalCardProps) {
  return (
    <Card className="hover:border-primary/50 transition-colors">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            {!signal.is_read && (
              <span className="h-2 w-2 rounded-full bg-primary flex-shrink-0" />
            )}
            <span className="font-medium text-sm truncate">{signal.competitor_name}</span>
          </div>
          <Badge variant={signal.urgency} className="flex-shrink-0">
            {signal.urgency}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-xs text-muted-foreground mb-2 capitalize">
          {signal.signal_type.replace(/_/g, ' ')} · {signal.signal_source}
        </p>
        <p className="text-sm text-muted-foreground line-clamp-3">{signal.strategic_context}</p>
        <div className="flex items-center justify-between mt-3">
          <span className="text-xs text-muted-foreground">
            {formatDistanceToNow(new Date(signal.detected_at), { addSuffix: true })}
          </span>
          <Link href={`/signals/${signal.id}`} className="text-xs text-primary hover:underline">
            View details →
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
