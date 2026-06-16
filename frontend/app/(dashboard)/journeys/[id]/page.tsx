import { notFound } from 'next/navigation';
import { getTokenServerSide } from '@/lib/auth';
import { fetchJourneyById } from '@/lib/api';
import { Header } from '@/components/layout/Header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';

interface JourneyDetailPageProps {
  params: { id: string };
}

export default async function JourneyDetailPage({ params }: JourneyDetailPageProps) {
  const token = getTokenServerSide();
  if (!token) notFound();

  let journey;
  try {
    journey = await fetchJourneyById(token, params.id);
  } catch {
    notFound();
  }

  return (
    <div>
      <Header
        title={`Funnel Step: ${journey.funnel_step}`}
        description={`Journey ID: ${params.id} · Analyzed ${format(new Date(journey.created_at), 'MMM d, yyyy')}`}
        actions={<Badge variant="warning">{journey.friction_cause.replace(/_/g, ' ')}</Badge>}
      />
      
      <div className="grid grid-cols-2 gap-4 mb-6">
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Drop-off Rate</p>
            <p className="text-3xl font-semibold mt-1">{(Number(journey.drop_off_rate) * 100).toFixed(1)}%</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Friction Score</p>
            <p className="text-3xl font-semibold mt-1">{Number(journey.friction_score).toFixed(2)}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recommendation</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-slate-300 leading-relaxed">
            {journey.recommendation}
          </p>
          {journey.projected_lift !== null && (
            <div className="mt-4 pt-4 border-t border-slate-700/50">
              <span className="text-sm text-muted-foreground">Projected Lift: </span>
              <span className="text-sm font-medium text-emerald-400">
                +{Number(journey.projected_lift).toFixed(1)}% conversion
              </span>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
