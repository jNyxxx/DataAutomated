import { cookies } from 'next/headers';
import { apiRequest } from '@/lib/api';
import ReportTrigger from '@/components/report-trigger';
import ReportDownload from '@/components/report-download';
import { FileBarChart2 } from 'lucide-react';

interface Report {
  id: string;
  report_type: string | null;
  s3_key: string | null;
  period_start: string | null;
  period_end: string | null;
  created_at: string;
}

const reportTypeLabels: Record<string, string> = {
  weekly_intelligence: 'Weekly Intelligence',
  competitive_brief:   'Competitive Brief',
  journey:             'Journey Report',
};

const reportTypeBadge: Record<string, { bg: string; color: string; border: string }> = {
  weekly_intelligence: { bg: 'rgba(99,102,241,0.10)', color: '#818CF8', border: 'rgba(99,102,241,0.22)' },
  competitive_brief:   { bg: 'rgba(6,182,212,0.10)',  color: '#22D3EE', border: 'rgba(6,182,212,0.22)' },
  journey:             { bg: 'rgba(139,92,246,0.10)', color: '#A78BFA', border: 'rgba(139,92,246,0.22)' },
};

export default async function ReportsPage() {
  const cookieStore = await cookies();
  const token       = cookieStore.get('token')!.value;
  const res         = await apiRequest<{ reports: Report[] }>('/api/reports/list', token).catch(() => null);
  const reports     = res?.reports ?? [];

  return (
    <div className="p-6 space-y-6 max-w-4xl page-enter">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center"
            style={{ background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.20)' }}
          >
            <FileBarChart2 size={16} style={{ color: '#818CF8' }} />
          </div>
          <div>
            <h1 className="text-xl font-bold" style={{ color: '#F1F5F9' }}>Reports</h1>
            <p className="text-sm" style={{ color: '#475569' }}>
              Generated weekly, or on-demand
            </p>
          </div>
        </div>
        <ReportTrigger token={token} />
      </div>

      {/* Reports table */}
      {reports.length > 0 ? (
        <div
          className="rounded-xl overflow-hidden"
          style={{ border: '1px solid rgba(148,163,184,0.09)' }}
        >
          <table className="w-full table-dark">
            <thead>
              <tr>
                <th className="text-left">Type</th>
                <th className="text-left">Period</th>
                <th className="text-left">Generated</th>
                <th className="text-right">File</th>
              </tr>
            </thead>
            <tbody>
              {reports.map((r) => {
                const badge = reportTypeBadge[r.report_type ?? ''] ?? {
                  bg: 'rgba(100,116,139,0.10)', color: '#94A3B8', border: 'rgba(100,116,139,0.18)',
                };
                return (
                  <tr key={r.id}>
                    <td>
                      <span
                        className="inline-flex items-center text-xs font-medium px-2 py-0.5 rounded-md"
                        style={{ background: badge.bg, color: badge.color, border: `1px solid ${badge.border}` }}
                      >
                        {reportTypeLabels[r.report_type ?? ''] ?? r.report_type ?? '—'}
                      </span>
                    </td>
                    <td className="tabular-nums">
                      {r.period_start?.slice(0, 10)}{' '}
                      <span style={{ color: '#334155' }}>→</span>{' '}
                      {r.period_end?.slice(0, 10)}
                    </td>
                    <td className="tabular-nums">
                      {r.created_at?.slice(0, 10)}
                    </td>
                    <td className="text-right">
                      {r.s3_key ? (
                        <ReportDownload reportId={r.id} token={token} />
                      ) : (
                        <span style={{ color: '#334155', fontSize: 12 }}>Pending</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="empty-state">
          <FileBarChart2 size={32} className="mx-auto mb-3" style={{ color: '#334155' }} />
          <p className="text-sm font-medium mb-1" style={{ color: '#475569' }}>
            No reports generated yet
          </p>
          <p className="text-xs" style={{ color: '#334155' }}>
            Reports run automatically every Monday, or generate one above.
          </p>
        </div>
      )}
    </div>
  );
}
