import Link from 'next/link';
import { formatDistanceToNow } from 'date-fns';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { FeedbackInsight } from '@/lib/types';

interface InsightCardProps {
  insight: FeedbackInsight;
}

const sentimentVariantMap = {
  positive: 'positive',
  negative: 'negative',
  mixed: 'warning',
  neutral: 'secondary',
} as const;

export function InsightCard({ insight }: InsightCardProps) {
  const themes =
    typeof insight.themes === 'string'
      ? (JSON.parse(insight.themes) as Record<string, number>)
      : insight.themes;
  const topThemes = Object.keys(themes ?? {}).slice(0, 3);
  const variant = sentimentVariantMap[insight.sentiment_label] ?? 'secondary';

  return (
    <Card className="hover:border-primary/50 transition-colors">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <Badge variant={variant}>{insight.sentiment_label}</Badge>
          <span className="text-xs text-muted-foreground">
            {formatDistanceToNow(new Date(insight.created_at), { addSuffix: true })}
          </span>
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground line-clamp-3 mb-3">{insight.narrative}</p>
        {topThemes.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap mb-3">
            {topThemes.map((theme) => (
              <span
                key={theme}
                className="text-xs bg-muted px-2 py-0.5 rounded-full text-muted-foreground"
              >
                {theme}
              </span>
            ))}
          </div>
        )}
        <div className="flex items-center justify-between">
          <span
            className={cn(
              'text-xs font-medium tabular-nums',
              insight.churn_risk > 0.15 ? 'text-yellow-400' : 'text-green-400',
            )}
          >
            Churn: {(insight.churn_risk * 100).toFixed(1)}%
          </span>
          <Link href={`/insights/${insight.id}`} className="text-xs text-primary hover:underline">
            View details →
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
