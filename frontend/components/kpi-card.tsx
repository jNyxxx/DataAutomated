interface KpiCardProps {
  label: string;
  value: string | number | null;
  warn?: boolean;
  sub?: string;
}

export default function KpiCard({ label, value, warn, sub }: KpiCardProps) {
  return (
    <div
      className={`rounded-lg border p-4 bg-white ${
        warn ? 'border-yellow-400 bg-yellow-50' : 'border-gray-200'
      }`}
    >
      <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">{label}</div>
      <div
        className={`text-2xl font-bold ${
          warn ? 'text-yellow-700' : 'text-gray-900'
        }`}
      >
        {value ?? '—'}
      </div>
      {sub && <div className="text-xs text-gray-400 mt-1">{sub}</div>}
    </div>
  );
}
