import { format } from 'date-fns';
import { getTokenServerSide } from '@/lib/auth';
import { fetchDataSources } from '@/lib/api';
import { Header } from '@/components/layout/Header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

const statusVariant: Record<string, 'positive' | 'negative' | 'warning' | 'secondary'> = {
  active: 'positive',
  failed: 'negative',
  pending_configuration: 'warning',
  disconnected: 'secondary',
};

export default async function SettingsPage() {
  const token = getTokenServerSide()!;
  const data = await fetchDataSources(token).catch(() => ({ sources: [] }));

  return (
    <div>
      <Header
        title="Settings"
        description="Manage connected data sources and integrations"
      />

      <Card>
        <CardHeader>
          <CardTitle>Connected Data Sources</CardTitle>
        </CardHeader>
        <CardContent>
          {data.sources.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              No data sources connected yet. Use the API or contact your admin to add integrations.
            </p>
          ) : (
            <div className="space-y-3">
              {data.sources.map((source) => (
                <div
                  key={source.id}
                  className="flex items-center justify-between py-3 border-b border-border last:border-0"
                >
                  <div>
                    <p className="font-medium capitalize">
                      {source.source_type.replace(/_/g, ' ')}
                    </p>
                    {source.last_synced_at && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Last synced {format(new Date(source.last_synced_at), 'MMM d, h:mm a')}
                      </p>
                    )}
                    {source.connection_error && (
                      <p className="text-xs text-destructive mt-0.5">{source.connection_error}</p>
                    )}
                  </div>
                  <Badge variant={statusVariant[source.connection_status] ?? 'secondary'}>
                    {source.connection_status.replace(/_/g, ' ')}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
