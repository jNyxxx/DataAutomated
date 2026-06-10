'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';

const links = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/insights', label: 'VoC Insights' },
  { href: '/signals', label: 'Signals' },
  { href: '/journeys', label: 'Journeys' },
  { href: '/reports', label: 'Reports' },
  { href: '/settings', label: 'Settings' },
];

export default function Nav() {
  const pathname = usePathname();
  const router = useRouter();

  function logout() {
    document.cookie = 'token=; path=/; max-age=0';
    router.push('/login');
  }

  return (
    <aside className="w-56 min-h-screen bg-gray-900 text-white flex flex-col py-6 px-4 gap-1 shrink-0">
      <div className="text-sm font-bold tracking-wide mb-6 text-indigo-400 uppercase px-2">
        DataAutomated
      </div>
      {links.map(({ href, label }) => (
        <Link
          key={href}
          href={href}
          className={`px-3 py-2 rounded text-sm transition-colors ${
            pathname.startsWith(href)
              ? 'bg-indigo-600 text-white'
              : 'text-gray-300 hover:bg-gray-800'
          }`}
        >
          {label}
        </Link>
      ))}
      <div className="mt-auto">
        <button
          onClick={logout}
          className="w-full text-left px-3 py-2 rounded text-sm text-gray-400 hover:bg-gray-800 transition-colors"
        >
          Sign out
        </button>
      </div>
    </aside>
  );
}
