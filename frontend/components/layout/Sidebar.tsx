'use client';

import Link from 'next/link';
import { BarChart3, Brain, TrendingUp, Route, FileText, Settings } from 'lucide-react';
import NavLink from './NavLink';

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: BarChart3 },
  { href: '/insights', label: 'VoC Insights', icon: Brain },
  { href: '/signals', label: 'Competitive', icon: TrendingUp },
  { href: '/journeys', label: 'Journeys', icon: Route },
  { href: '/reports', label: 'Reports', icon: FileText },
  { href: '/settings', label: 'Settings', icon: Settings },
] as const;

export function Sidebar() {
  return (
    <aside className="fixed left-0 top-0 h-screen w-60 border-r border-border bg-card flex flex-col z-40">
      <div className="p-6 border-b border-border">
        <Link href="/dashboard" className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-md bg-primary flex items-center justify-center text-primary-foreground font-bold text-xs">
            DA
          </div>
          <span className="font-semibold text-foreground text-sm">DataAutomated</span>
        </Link>
      </div>
      <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
        {navItems.map((item) => (
          <NavLink key={item.href} href={item.href} icon={item.icon} label={item.label} />
        ))}
      </nav>
    </aside>
  );
}
