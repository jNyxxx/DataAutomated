'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { LayoutDashboard, BrainCircuit, Activity, Route, FileText, Settings, ChevronDown, LogOut } from 'lucide-react';
import { cn } from '@/lib/utils';

const NAV_GROUPS = [
  {
    group: "Overview",
    items: [
      { id: "dashboard", href: "/dashboard", label: "Dashboard", icon: LayoutDashboard }
    ]
  },
  {
    group: "Intelligence",
    items: [
      { id: "insights", href: "/insights", label: "Voice of Customer", icon: BrainCircuit },
      { id: "signals", href: "/signals", label: "Competitive Signals", icon: Activity },
      { id: "journeys", href: "/journeys", label: "Journey Intelligence", icon: Route },
      { id: "reports", href: "/reports", label: "Reports", icon: FileText },
    ]
  },
  {
    group: "Workspace",
    items: [
      { id: "settings", href: "/settings", label: "Settings & Sources", icon: Settings }
    ]
  }
];

export function Sidebar({ clientName = "Your account", plan = "" }: { clientName?: string; plan?: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setProfileOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
    router.refresh();
  }

  return (
    <aside className="hidden w-64 shrink-0 flex-col bg-slate-900 md:flex border-r border-slate-800">
      <div className="flex items-center gap-2 px-5 py-5">
        <Link href="/dashboard" className="text-base font-semibold tracking-tight text-white hover:opacity-90">
          DataAutomated
        </Link>
      </div>
      
      <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-2 text-sm">
        {NAV_GROUPS.map((g, gi) => (
          <div key={g.group}>
            <p className={cn("px-3 mb-2 text-[10px] font-semibold uppercase tracking-widest text-slate-500", gi === 0 ? "mt-2" : "mt-6")}>
              {g.group}
            </p>
            <ul className="space-y-0.5">
              {g.items.map(it => {
                const active = pathname.startsWith(it.href);
                const Icon = it.icon;
                return (
                  <li key={it.id}>
                    <Link
                      href={it.href}
                      className={cn(
                        "group flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition-[transform,colors] duration-200 ease-out active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500",
                        active ? "bg-slate-800 font-medium text-white" : "text-slate-400 hover:bg-slate-800/50 hover:text-slate-200"
                      )}
                    >
                      <Icon className={cn("h-5 w-5 shrink-0 transition-colors", active ? "text-white" : "text-slate-500 group-hover:text-slate-300")} strokeWidth={1.75} />
                      <span className="flex-1 truncate">{it.label}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="relative p-3" ref={profileRef}>
        {profileOpen && (
          <div className="absolute bottom-full left-3 right-3 mb-2 rounded-xl border border-slate-700/50 bg-slate-800 p-1.5 shadow-xl animate-in slide-in-from-bottom-2">
            <Link 
              href="/settings"
              onClick={() => setProfileOpen(false)}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-300 transition-colors hover:bg-slate-700/50 hover:text-slate-100"
            >
              <Settings className="size-4" />
              Settings
            </Link>
            <div className="my-1 h-px w-full bg-slate-700/50"></div>
            <button 
              onClick={handleLogout}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-rose-400 transition-colors hover:bg-slate-700/50 hover:text-rose-300"
            >
              <LogOut className="size-4" />
              Log out
            </button>
          </div>
        )}
        <button 
          onClick={() => setProfileOpen(!profileOpen)}
          className={cn(
            "flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition-[transform,colors] duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500",
            profileOpen ? "bg-slate-800" : "hover:bg-slate-800 active:scale-[0.98]"
          )}
        >
          <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-blue-500/15 text-sm font-semibold text-blue-300">{clientName.charAt(0).toUpperCase() || "?"}</span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium text-slate-200">{clientName}</span>
            <span className="block truncate text-xs text-slate-400">{plan || "DataAutomated"}</span>
          </span>
          <ChevronDown className={cn("size-4 shrink-0 text-slate-400 transition-transform duration-200", profileOpen && "rotate-180")} />
        </button>
      </div>
    </aside>
  );
}
