import { notFound } from 'next/navigation';
import { format } from 'date-fns';
import { getTokenServerSide } from '@/lib/auth';
import { fetchSignalById } from '@/lib/api';
import { Header } from '@/components/layout/Header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface SignalDetailPageProps {
  params: { id: string };
}

export default async function SignalDetailPage({ params }: SignalDetailPageProps) {
  const token = getTokenServerSide()!;
  let signal;
  try {
    signal = await fetchSignalById(token, params.id);
  } catch {
    notFound();
  }

  return (
    <div>
      <Header
        title={signal.competitor_name}
        description={`Detected ${format(new Date(signal.detected_at), 'MMM d, yyyy · h:mm a')}`}
        actions={<Badge variant={(signal.urgency === 'medium' ? 'warning' : signal.urgency) as any}>{signal.urgency}</Badge>}
      />

      <div className="grid grid-cols-3 gap-4 mb-6">
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Signal Type</p>
            <p className="font-semibold mt-1 capitalize">
              {signal.signal_type.replace(/_/g, ' ')}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Source</p>
            <p className="font-semibold mt-1">{signal.signal_source}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Status</p>
            <p className="font-semibold mt-1">{signal.is_read ? 'Read' : 'Unread'}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Strategic Context</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">
            {signal.strategic_context}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
