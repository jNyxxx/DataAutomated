import Link from 'next/link';
import { ExternalLink } from 'lucide-react';

const steps = [
  {
    title: 'Connect a data source',
    detail: 'Add Zendesk, Typeform, Intercom, or another source in Settings to begin ingestion.',
    href: '/settings',
  },
  {
    title: 'Trigger your first analysis',
    detail: 'Navigate to Insights, Signals, or Journeys and click "Trigger Analysis" to run the AI agent.',
    href: '/insights',
  },
  {
    title: 'Review your first insight',
    detail: 'AI-generated intelligence appears here once your first analysis completes — usually within 60 seconds.',
    href: null,
  },
];

export default function OnboardingChecklist() {
  return (
    <div
      className="rounded-xl p-6 col-span-full"
      style={{ background: '#151E35', border: '1px solid rgba(148,163,184,0.09)' }}
    >
      <div className="mb-5">
        <h2 className="text-base font-semibold mb-1" style={{ color: '#F1F5F9' }}>
          Get started with DataAutomated
        </h2>
        <p className="text-sm" style={{ color: '#475569' }}>
          Three steps to your first AI-generated business intelligence report.
        </p>
      </div>

      <ol className="space-y-5">
        {steps.map((step, i) => (
          <li key={i} className="flex items-start gap-3">
            <div
              className="mt-0.5 shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold"
              style={{
                background: 'rgba(99,102,241,0.12)',
                border: '1px solid rgba(99,102,241,0.22)',
                color: '#818CF8',
              }}
            >
              {i + 1}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-sm font-medium" style={{ color: '#E2E8F0' }}>
                  {step.title}
                </span>
                {step.href && (
                  <Link
                    href={step.href}
                    className="flex items-center gap-0.5 text-xs transition-colors"
                    style={{ color: '#6366F1' }}
                  >
                    Go <ExternalLink size={10} />
                  </Link>
                )}
              </div>
              <p className="text-xs leading-relaxed" style={{ color: '#475569' }}>
                {step.detail}
              </p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
