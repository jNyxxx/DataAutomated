import { format } from 'date-fns';
import { FileText, Download } from 'lucide-react';
import { getTokenServerSide } from '@/lib/auth';
import { fetchReports } from '@/lib/api';
import { Header } from '@/components/layout/Header';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export default async function ReportsPage() {
  const token = getTokenServerSide()!;
  const data = await fetchReports(token).catch(() => ({ reports: [] }));

  return (
    <div>
      <Header
        title="Reports"
        description="Generated intelligence briefings and weekly reports"
      />

      {data.reports.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-64 text-center gap-2">
          <p className="text-muted-foreground">No reports generated yet.</p>
          <p className="text-sm text-muted-foreground">
            Reports are generated automatically on Monday mornings via the weekly workflow.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {data.reports.map((report) => (
            <Card key={report.id}>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <FileText className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                    <div>
                      <p className="font-medium capitalize">
                        {report.report_type.replace(/_/g, ' ')}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {format(new Date(report.period_start), 'MMM d')} –{' '}
                        {format(new Date(report.period_end), 'MMM d, yyyy')}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge variant="secondary">
                      {format(new Date(report.created_at), 'MMM d')}
                    </Badge>
                    <a
                      href={`/api/reports/${report.id}/download`}
                      className="flex items-center gap-1.5 text-sm text-primary hover:underline"
                    >
                      <Download className="h-4 w-4" />
                      Download
                    </a>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
