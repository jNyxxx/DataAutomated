import { cookies } from 'next/headers';
import { apiRequest } from '@/lib/api';
import ReportTrigger from '@/components/report-trigger';

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
  competitive_brief: 'Competitive Brief',
  journey: 'Journey Report',
};

export default async function ReportsPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get('token')!.value;
  const res = await apiRequest<{ reports: Report[] }>('/api/reports/list', token).catch(() => null);
  const reports = res?.reports ?? [];

  return (
    <div className="p-6 space-y-5 max-w-4xl">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Reports</h1>
        <ReportTrigger token={token} />
      </div>

      {reports.length > 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Type</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Period</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Generated</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {reports.map((r) => (
                <tr key={r.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">
                    {reportTypeLabels[r.report_type ?? ''] ?? r.report_type ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-gray-500">
                    {r.period_start?.slice(0, 10)} → {r.period_end?.slice(0, 10)}
                  </td>
                  <td className="px-4 py-3 text-gray-500">
                    {r.created_at?.slice(0, 10)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {r.s3_key && (
                      <span className="text-xs text-indigo-600 font-medium">PDF ready</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="bg-white border border-dashed border-gray-300 rounded-xl p-10 text-center">
          <p className="text-gray-400 text-sm mb-3">No reports generated yet.</p>
          <p className="text-gray-400 text-xs">Reports are generated automatically every Monday. You can also trigger one manually above.</p>
        </div>
      )}
    </div>
  );
}
