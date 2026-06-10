const styles: Record<string, string> = {
  critical: 'bg-red-100 text-red-800 border border-red-200',
  high: 'bg-orange-100 text-orange-800 border border-orange-200',
  medium: 'bg-yellow-100 text-yellow-800 border border-yellow-200',
  low: 'bg-gray-100 text-gray-700 border border-gray-200',
};

export default function UrgencyBadge({ urgency }: { urgency: string | null }) {
  const key = urgency?.toLowerCase() ?? 'low';
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded ${styles[key] ?? styles.low}`}>
      {urgency ?? 'low'}
    </span>
  );
}
