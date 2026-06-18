'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { LayoutDashboard, BrainCircuit, Activity, Route, FileText, Settings, ChevronDown, LogOut, ChevronLeft, ChevronRight } from 'lucide-react';
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
  const [isCollapsed, setIsCollapsed] = useState(false);
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
    <aside 
      className={cn(
        "relative hidden shrink-0 flex-col bg-slate-900 md:flex border-r border-slate-800 transition-all duration-300 ease-in-out",
        isCollapsed ? "w-20" : "w-64"
      )}
    >
      <button
        onClick={() => setIsCollapsed(!isCollapsed)}
        className="absolute -right-3.5 top-6 z-20 flex size-7 items-center justify-center rounded-full border border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white transition-colors"
      >
        {isCollapsed ? <ChevronRight className="size-4" /> : <ChevronLeft className="size-4" />}
      </button>

      <div className={cn("flex items-center px-5 py-5", isCollapsed ? "justify-center px-0" : "gap-2")}>
        <Link href="/dashboard" className="text-base font-semibold tracking-tight text-white hover:opacity-90 truncate">
          {isCollapsed ? "DA" : "DataAutomated"}
        </Link>
      </div>
      
      <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-2 text-sm overflow-x-hidden">
        {NAV_GROUPS.map((g, gi) => (
          <div key={g.group}>
            {!isCollapsed ? (
              <p className={cn("px-3 mb-2 text-[10px] font-semibold uppercase tracking-widest text-slate-500", gi === 0 ? "mt-2" : "mt-6")}>
                {g.group}
              </p>
            ) : (
              gi !== 0 && <div className="my-4 mx-auto h-px w-6 bg-slate-800" />
            )}
            <ul className="space-y-0.5">
              {g.items.map(it => {
                const active = pathname.startsWith(it.href);
                const Icon = it.icon;
                return (
                  <li key={it.id} className="relative">
                    <Link
                      href={it.href}
                      title={isCollapsed ? it.label : undefined}
                      className={cn(
                        "group flex w-full items-center rounded-lg py-2 text-left text-sm transition-[transform,colors] duration-200 ease-out active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500",
                        active ? "bg-slate-800/80 font-medium text-white shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)]" : "text-slate-400 hover:bg-slate-800/50 hover:text-slate-200",
                        isCollapsed ? "justify-center px-0" : "gap-3 px-3"
                      )}
                    >
                      {active && (
                        <div className="absolute inset-y-1.5 left-0 w-1 rounded-r-full bg-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.6)]" />
                      )}
                      <Icon className={cn("h-5 w-5 shrink-0 transition-colors", active ? "text-blue-400" : "text-slate-500 group-hover:text-slate-300")} strokeWidth={1.75} />
                      {!isCollapsed && <span className="flex-1 truncate">{it.label}</span>}
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
          <div className={cn("absolute bottom-full mb-2 rounded-xl border border-slate-700/50 bg-slate-800 p-1.5 shadow-xl animate-in slide-in-from-bottom-2", isCollapsed ? "left-3 w-48" : "left-3 right-3")}>
            {isCollapsed && (
              <>
                <div className="px-3 py-2">
                  <p className="truncate text-sm font-medium text-slate-200">{clientName}</p>
                  <p className="truncate text-xs text-slate-400">{plan || "DataAutomated"}</p>
                </div>
                <div className="my-1 h-px w-full bg-slate-700/50"></div>
              </>
            )}
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
            "flex w-full items-center rounded-lg py-2 text-left transition-[transform,colors] duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500",
            profileOpen ? "bg-slate-800" : "hover:bg-slate-800 active:scale-[0.98]",
            isCollapsed ? "justify-center px-0 gap-0" : "gap-3 px-2"
          )}
        >
          <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-blue-500/15 text-sm font-semibold text-blue-300">{clientName.charAt(0).toUpperCase() || "?"}</span>
          {!isCollapsed && (
            <>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-slate-200">{clientName}</span>
                <span className="block truncate text-xs text-slate-400">{plan || "DataAutomated"}</span>
              </span>
              <ChevronDown className={cn("size-4 shrink-0 text-slate-400 transition-transform duration-200", profileOpen && "rotate-180")} />
            </>
          )}
        </button>
      </div>
    </aside>
  );
}
