"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  MessageSquare,
  Radar,
  Route,
  FileText,
  Settings,
  Users,
  CreditCard,
  KeyRound,
  LogOut,
  ChevronDown,
  type LucideIcon,
} from "lucide-react";
import { cn, focusRing } from "@/lib/utils";

type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  dot?: string;
  count?: number;
};

const GROUPS: { label: string; items: NavItem[] }[] = [
  {
    label: "Overview",
    items: [{ href: "/", label: "Dashboard", icon: LayoutDashboard }],
  },
  {
    label: "Intelligence",
    items: [
      { href: "/voc", label: "Voice of Customer", icon: MessageSquare, dot: "bg-teal-400" },
      { href: "/competitive", label: "Competitive Signals", icon: Radar, dot: "bg-rose-400", count: 3 },
      { href: "/journey", label: "Journey Intelligence", icon: Route, dot: "bg-blue-400" },
      // Reports promoted into the core Intelligence group.
      { href: "/reports", label: "Reports", icon: FileText },
    ],
  },
  {
    label: "Workspace",
    items: [{ href: "/settings", label: "Settings & Sources", icon: Settings }],
  },
];

const ACCOUNT_MENU = [
  { label: "Team & Roles", icon: Users, href: "/settings/team" },
  { label: "Billing & Plan", icon: CreditCard, href: "/settings/billing" },
  { label: "API Keys", icon: KeyRound, href: "/settings/api-keys" },
];

export function Sidebar() {
  const pathname = usePathname();
  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <aside className="hidden w-64 shrink-0 flex-col bg-slate-900 md:flex">
      <div className="flex items-center gap-2 px-5 py-5">
        <span className="text-base font-semibold tracking-tight text-white">
          Data<span className="text-blue-400">●</span>Automated
        </span>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-2">
        {GROUPS.map((group, gi) => (
          <div key={group.label}>
            <p
              className={cn(
                "px-3 mb-2 text-[10px] font-semibold uppercase tracking-widest text-slate-500",
                gi === 0 ? "mt-2" : "mt-6",
              )}
            >
              {group.label}
            </p>
            <ul className="space-y-0.5">
              {group.items.map((item) => {
                const active = isActive(item.href);
                const Icon = item.icon;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "group flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                        focusRing,
                        active
                          ? "bg-slate-800 font-medium text-white"
                          : "text-slate-400 hover:bg-slate-800/50 hover:text-slate-200",
                      )}
                    >
                      <Icon
                        className={cn(
                          "h-5 w-5 shrink-0 transition-colors",
                          active ? "text-white" : "text-slate-500 group-hover:text-slate-300",
                        )}
                      />
                      <span className="flex-1 truncate">{item.label}</span>
                      {item.count != null ? (
                        <span className="shrink-0 rounded-full bg-rose-500/15 px-1.5 text-xs font-medium text-rose-300">
                          {item.count}
                        </span>
                      ) : item.dot ? (
                        <span className={cn("size-2 shrink-0 rounded-full", item.dot)} />
                      ) : null}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* User admin grouped at the bottom-left */}
      <AccountMenu />
    </aside>
  );
}

function AccountMenu() {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  return (
    <div ref={ref} className="relative p-3">
      {open && (
        <div className="absolute bottom-full left-3 right-3 mb-2 overflow-hidden rounded-xl bg-slate-800 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)] py-1 shadow-xl shadow-black/40 ring-1 ring-white/10">
          {ACCOUNT_MENU.map((m) => {
            const Icon = m.icon;
            return (
              <Link
                key={m.label}
                href={m.href}
                className={cn(
                  "flex items-center gap-3 px-3 py-2 text-sm text-slate-300 hover:bg-slate-700/60 hover:text-white",
                  focusRing,
                )}
              >
                <Icon className="size-4 text-slate-400" />
                {m.label}
              </Link>
            );
          })}
          <div className="my-1 h-px bg-white/5" />
          <button
            className={cn(
              "flex w-full items-center gap-3 px-3 py-2 text-sm text-slate-300 hover:bg-slate-700/60 hover:text-white",
              focusRing,
            )}
          >
            <LogOut className="size-4 text-slate-400" />
            Sign out
          </button>
        </div>
      )}

      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className={cn(
          "flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-slate-800",
          focusRing,
        )}
      >
        <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-blue-500/15 text-sm font-semibold text-blue-300">
          A
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-slate-200">Acme SaaS Inc.</span>
          <span className="block truncate text-xs text-slate-400">Intelligence Core</span>
        </span>
        <ChevronDown
          className={cn("size-4 shrink-0 text-slate-400 transition-transform", open && "rotate-180")}
        />
      </button>
    </div>
  );
}
