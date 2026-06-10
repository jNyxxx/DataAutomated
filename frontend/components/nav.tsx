'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard,
  MessageSquareText,
  Zap,
  GitBranch,
  FileBarChart2,
  Settings,
  LogOut,
  Sparkles,
} from 'lucide-react';

const NAV_GROUPS = [
  {
    label: 'Analytics',
    items: [
      { href: '/dashboard', label: 'Overview',     icon: LayoutDashboard },
      { href: '/insights',  label: 'VoC Insights', icon: MessageSquareText },
      { href: '/signals',   label: 'Signals',      icon: Zap },
      { href: '/journeys',  label: 'Journeys',     icon: GitBranch },
    ],
  },
  {
    label: 'Output',
    items: [
      { href: '/reports', label: 'Reports', icon: FileBarChart2 },
    ],
  },
  {
    label: 'System',
    items: [
      { href: '/settings', label: 'Settings', icon: Settings },
    ],
  },
];

export default function Nav() {
  const pathname = usePathname();
  const router   = useRouter();

  function logout() {
    document.cookie = 'token=; path=/; max-age=0';
    router.push('/login');
  }

  return (
    <aside
      className="w-60 min-h-screen flex flex-col shrink-0 relative"
      style={{
        background: '#0F1629',
        borderRight: '1px solid rgba(148,163,184,0.07)',
      }}
    >
      {/* Subtle top glow */}
      <div
        className="absolute top-0 left-0 right-0 h-40 pointer-events-none"
        style={{
          background: 'radial-gradient(ellipse at 50% -20%, rgba(99,102,241,0.12) 0%, transparent 70%)',
        }}
      />

      {/* ── Logo ─────────────────────────────── */}
      <div className="relative px-4 pt-6 pb-5">
        <div className="flex items-center gap-2.5 px-2">
          {/* Icon mark */}
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
            style={{ background: 'linear-gradient(135deg, #6366F1 0%, #8B5CF6 100%)' }}
          >
            <Sparkles size={15} className="text-white" strokeWidth={2.5} />
          </div>
          {/* Wordmark */}
          <div>
            <div
              className="text-sm font-bold leading-none tracking-tight"
              style={{
                background: 'linear-gradient(120deg, #818CF8 0%, #A78BFA 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
              }}
            >
              DataAutomated
            </div>
            <div className="text-[10px] mt-0.5 leading-none tracking-wide" style={{ color: '#475569' }}>
              Intelligence Platform
            </div>
          </div>
        </div>
      </div>

      {/* Divider */}
      <div className="mx-4 mb-3 h-px" style={{ background: 'rgba(148,163,184,0.07)' }} />

      {/* ── Navigation ───────────────────────── */}
      <nav className="relative flex-1 px-3 space-y-5 overflow-y-auto py-1">
        {NAV_GROUPS.map((group) => (
          <div key={group.label}>
            {/* Group label */}
            <div
              className="px-3 mb-1.5 text-[10px] font-semibold uppercase tracking-widest"
              style={{ color: '#334155' }}
            >
              {group.label}
            </div>

            {/* Items */}
            <ul className="space-y-0.5">
              {group.items.map(({ href, label, icon: Icon }) => {
                const isActive = pathname.startsWith(href);
                return (
                  <li key={href}>
                    <Link
                      href={href}
                      className={[
                        'flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all duration-150 select-none',
                        isActive
                          ? 'font-medium'
                          : 'hover:bg-white/[0.04]',
                      ].join(' ')}
                      style={
                        isActive
                          ? {
                              background: 'rgba(99,102,241,0.11)',
                              boxShadow: 'inset 3px 0 0 #6366F1',
                              color: '#E0E7FF',
                            }
                          : { color: '#64748B' }
                      }
                      onMouseEnter={(e) => {
                        if (!isActive) (e.currentTarget as HTMLElement).style.color = '#CBD5E1';
                      }}
                      onMouseLeave={(e) => {
                        if (!isActive) (e.currentTarget as HTMLElement).style.color = '#64748B';
                      }}
                    >
                      <Icon
                        size={15}
                        style={{ color: isActive ? '#818CF8' : '#475569', flexShrink: 0 }}
                      />
                      {label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* ── Bottom: Sign out ─────────────────── */}
      <div className="relative px-3 py-4">
        <div className="h-px mb-3" style={{ background: 'rgba(148,163,184,0.07)' }} />
        <button
          id="nav-signout"
          onClick={logout}
          className="flex items-center gap-3 w-full px-3 py-2 rounded-lg text-sm transition-all duration-150 hover:bg-white/[0.04]"
          style={{ color: '#475569' }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = '#94A3B8'; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = '#475569'; }}
        >
          <LogOut size={15} style={{ flexShrink: 0 }} />
          Sign out
        </button>
      </div>
    </aside>
  );
}
