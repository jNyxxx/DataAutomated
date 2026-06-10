interface KpiCardProps {
  label: string;
  value: string | number | null;
  warn?: boolean;
  sub?: string;
  icon?: React.ReactNode;
}

export default function KpiCard({ label, value, warn, sub }: KpiCardProps) {
  return (
    <div
      className="rounded-xl p-5 transition-all duration-200 cursor-default select-none"
      style={{
        background: warn ? 'rgba(245,158,11,0.06)' : '#151E35',
        border: warn
          ? '1px solid rgba(245,158,11,0.22)'
          : '1px solid rgba(148,163,184,0.09)',
        boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
      }}
      onMouseEnter={(e) => {
        const el = e.currentTarget as HTMLElement;
        el.style.transform = 'translateY(-2px)';
        el.style.boxShadow = warn
          ? '0 10px 28px rgba(0,0,0,0.3), 0 0 18px rgba(245,158,11,0.1)'
          : '0 10px 28px rgba(0,0,0,0.3), 0 0 18px rgba(99,102,241,0.1)';
        el.style.borderColor = warn
          ? 'rgba(245,158,11,0.38)'
          : 'rgba(99,102,241,0.28)';
      }}
      onMouseLeave={(e) => {
        const el = e.currentTarget as HTMLElement;
        el.style.transform = 'translateY(0)';
        el.style.boxShadow = '0 2px 8px rgba(0,0,0,0.2)';
        el.style.borderColor = warn
          ? 'rgba(245,158,11,0.22)'
          : 'rgba(148,163,184,0.09)';
      }}
    >
      {/* Label */}
      <div
        className="text-[11px] font-semibold uppercase tracking-widest mb-3"
        style={{ color: '#475569' }}
      >
        {label}
      </div>

      {/* Value */}
      <div
        className="text-3xl font-bold leading-none mb-2.5 tabular-nums"
        style={{
          color: warn ? '#F59E0B' : '#F1F5F9',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {value ?? '—'}
      </div>

      {/* Sub-label */}
      {sub && (
        <div
          className="text-xs leading-relaxed"
          style={{ color: warn ? 'rgba(245,158,11,0.65)' : '#475569' }}
        >
          {sub}
        </div>
      )}
    </div>
  );
}
