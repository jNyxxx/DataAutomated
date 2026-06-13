'use client';

import { useState, useEffect } from 'react';
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
  Menu,
  X,
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

function NavContent({
  onLinkClick,
  onLogout,
}: {
  onLinkClick?: () => void;
  onLogout: () => void;
}) {
  const pathname = usePathname();

  return (
    <>
      {/* ── Logo ─────────────────────────────── */}
      <div className="relative px-4 pt-6 pb-5">
        <div className="flex items-center gap-2.5 px-2">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
            style={{ background: 'linear-gradient(135deg, #6366F1 0%, #8B5CF6 100%)' }}
          >
            <Sparkles size={15} className="text-white" strokeWidth={2.5} />
          </div>
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
            <div
              className="px-3 mb-1.5 text-[10px] font-semibold uppercase tracking-widest"
              style={{ color: '#334155' }}
            >
              {group.label}
            </div>

            <ul className="space-y-0.5">
              {group.items.map(({ href, label, icon: Icon }) => {
                const isActive = pathname.startsWith(href);
                return (
                  <li key={href}>
                    <Link
                      href={href}
                      onClick={onLinkClick}
                      className={[
                        'flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all duration-150 select-none',
                        isActive ? 'font-medium' : 'hover:bg-white/[0.04]',
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
          onClick={onLogout}
          className="flex items-center gap-3 w-full px-3 py-2 rounded-lg text-sm transition-all duration-150 hover:bg-white/[0.04]"
          style={{ color: '#475569' }}
        >
          <LogOut size={15} style={{ flexShrink: 0 }} />
          Sign out
        </button>
      </div>
    </>
  );
}

export default function Nav() {
  const router   = useRouter();
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  // Close drawer whenever the route changes
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  // Lock body scroll when mobile drawer is open
  useEffect(() => {
    if (mobileOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [mobileOpen]);

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' }).catch(() => null);
    router.push('/login');
    router.refresh();
  }

  const sidebarBg: React.CSSProperties = {
    background: '#0F1629',
    borderRight: '1px solid rgba(148,163,184,0.07)',
  };

  return (
    <>
      {/* ── Mobile top bar (hidden md+) ──────────────────── */}
      <div
        className="md:hidden fixed top-0 left-0 right-0 z-40 h-14 flex items-center px-4 gap-3"
        style={{ background: '#0F1629', borderBottom: '1px solid rgba(148,163,184,0.07)' }}
      >
        <button
          aria-label="Open navigation"
          onClick={() => setMobileOpen(true)}
          className="w-9 h-9 rounded-lg flex items-center justify-center transition-colors duration-150 hover:bg-white/[0.06]"
          style={{ color: '#64748B' }}
        >
          <Menu size={18} />
        </button>

        {/* Compact logo */}
        <div className="flex items-center gap-2">
          <div
            className="w-6 h-6 rounded-md flex items-center justify-center shrink-0"
            style={{ background: 'linear-gradient(135deg, #6366F1 0%, #8B5CF6 100%)' }}
          >
            <Sparkles size={11} className="text-white" strokeWidth={2.5} />
          </div>
          <span
            className="text-sm font-bold"
            style={{
              background: 'linear-gradient(120deg, #818CF8 0%, #A78BFA 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
            }}
          >
            DataAutomated
          </span>
        </div>
      </div>

      {/* ── Mobile drawer overlay ────────────────────────── */}
      {mobileOpen && (
        <div
          className="md:hidden fixed inset-0 z-50"
          style={{ background: 'rgba(0,0,0,0.55)' }}
          onClick={() => setMobileOpen(false)}
          aria-label="Close navigation"
        >
          <aside
            className="w-64 h-full flex flex-col"
            style={sidebarBg}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close button */}
            <div className="flex justify-end px-4 pt-4 pb-0">
              <button
                aria-label="Close menu"
                onClick={() => setMobileOpen(false)}
                className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-white/[0.06]"
                style={{ color: '#64748B' }}
              >
                <X size={16} />
              </button>
            </div>
            <NavContent onLinkClick={() => setMobileOpen(false)} onLogout={logout} />
          </aside>
        </div>
      )}

      {/* ── Desktop sidebar (hidden below md) ───────────── */}
      <aside
        className="hidden md:flex flex-col w-60 min-h-screen shrink-0 relative"
        style={sidebarBg}
      >
        {/* Subtle top glow */}
        <div
          className="absolute top-0 left-0 right-0 h-40 pointer-events-none"
          style={{
            background: 'radial-gradient(ellipse at 50% -20%, rgba(99,102,241,0.12) 0%, transparent 70%)',
          }}
        />
        <NavContent onLogout={logout} />
      </aside>
    </>
  );
}
