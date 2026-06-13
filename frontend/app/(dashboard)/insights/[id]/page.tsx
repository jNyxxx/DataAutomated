import { notFound } from 'next/navigation';
import { format } from 'date-fns';
import { getTokenServerSide } from '@/lib/auth';
import { fetchInsightById } from '@/lib/api';
import { Header } from '@/components/layout/Header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface InsightDetailPageProps {
  params: { id: string };
}

export default async function InsightDetailPage({ params }: InsightDetailPageProps) {
  const token = getTokenServerSide()!;
  let insight;
  try {
    insight = await fetchInsightById(token, params.id);
  } catch {
    notFound();
  }

  const themes =
    typeof insight.themes === 'string'
      ? (JSON.parse(insight.themes) as Record<string, number>)
      : insight.themes;

  return (
    <div>
      <Header
        title="Insight Detail"
        description={`Period: ${format(new Date(insight.period_start), 'MMM d')} – ${format(new Date(insight.period_end), 'MMM d, yyyy')}`}
      />

      <div className="grid grid-cols-3 gap-4 mb-6">
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Sentiment</p>
            <div className="flex items-center gap-2 mt-1">
              <Badge variant={insight.sentiment_label === 'positive' ? 'success' : insight.sentiment_label === 'negative' ? 'critical' : 'neutral'}>
                {insight.sentiment_label}
              </Badge>
              <span className="text-lg font-bold tabular-nums">
                {(insight.sentiment_score * 100).toFixed(0)}%
              </span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Churn Risk</p>
            <p className={`text-2xl font-bold mt-1 tabular-nums ${insight.churn_risk > 0.15 ? 'text-yellow-400' : 'text-green-400'}`}>
              {(insight.churn_risk * 100).toFixed(1)}%
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Urgency</p>
            <p className="text-2xl font-bold mt-1 tabular-nums">
              {(insight.urgency_score * 100).toFixed(0)}%
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Narrative</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">
                {insight.narrative}
              </p>
            </CardContent>
          </Card>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Themes</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {Object.entries(themes ?? {}).map(([theme, score]) => (
              <div key={theme} className="flex items-center justify-between">
                <span className="text-sm text-foreground capitalize">{theme}</span>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {(Number(score) * 100).toFixed(0)}%
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
