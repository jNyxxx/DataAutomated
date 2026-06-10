/* Urgency badge — dark-mode themed with colored status dots */

const CONFIG: Record<string, {
  bg: string; text: string; border: string; dot: string; pulse: boolean;
}> = {
  critical: {
    bg:     'rgba(239, 68, 68, 0.10)',
    text:   '#F87171',
    border: 'rgba(239, 68, 68, 0.22)',
    dot:    '#EF4444',
    pulse:  true,
  },
  high: {
    bg:     'rgba(249, 115, 22, 0.10)',
    text:   '#FB923C',
    border: 'rgba(249, 115, 22, 0.22)',
    dot:    '#F97316',
    pulse:  false,
  },
  medium: {
    bg:     'rgba(245, 158, 11, 0.10)',
    text:   '#FBBF24',
    border: 'rgba(245, 158, 11, 0.22)',
    dot:    '#F59E0B',
    pulse:  false,
  },
  low: {
    bg:     'rgba(100, 116, 139, 0.10)',
    text:   '#94A3B8',
    border: 'rgba(100, 116, 139, 0.18)',
    dot:    '#64748B',
    pulse:  false,
  },
};

export default function UrgencyBadge({ urgency }: { urgency: string | null }) {
  const key = urgency?.toLowerCase() ?? 'low';
  const cfg = CONFIG[key] ?? CONFIG.low;

  return (
    <span
      className="inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-md shrink-0"
      style={{
        background: cfg.bg,
        color:      cfg.text,
        border:     `1px solid ${cfg.border}`,
      }}
    >
      {/* Status dot */}
      <span
        className="w-1.5 h-1.5 rounded-full shrink-0"
        style={{
          background: cfg.dot,
          animation: cfg.pulse ? 'pulse-dot 1.6s ease-in-out infinite' : 'none',
        }}
      />
      {urgency ?? 'low'}
    </span>
  );
}
