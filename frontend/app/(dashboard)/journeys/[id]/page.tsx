import { notFound } from 'next/navigation';
import { getTokenServerSide } from '@/lib/auth';
import { Header } from '@/components/layout/Header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface JourneyDetailPageProps {
  params: { id: string };
}

export default async function JourneyDetailPage({ params }: JourneyDetailPageProps) {
  const token = getTokenServerSide();
  if (!token) notFound();

  // Journey detail fetched directly — fetchJourneyById not in MVP API, so derive from list
  // TODO: add GET /journeys/{id} endpoint and fetchJourneyById() in lib/api.ts
  return (
    <div>
      <Header
        title="Journey Detail"
        description={`Journey ID: ${params.id}`}
      />
      <Card>
        <CardHeader>
          <CardTitle>Journey Analysis</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Detailed journey view coming soon. The journey agent populates this via the
            /journeys/latest endpoint — a per-ID route will be wired once the backend exposes it.
          </p>
          <Badge variant="secondary" className="mt-4">Stub</Badge>
        </CardContent>
      </Card>
    </div>
  );
}
