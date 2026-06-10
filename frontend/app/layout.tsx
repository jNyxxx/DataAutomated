import type { Metadata } from 'next';
import './globals.css';
import Nav from '@/components/nav';
import SseWatcher from '@/components/sse-watcher';
import { cookies } from 'next/headers';

export const metadata: Metadata = {
  title: 'DataAutomated.io',
  description: 'AI-powered business intelligence platform',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const token = cookieStore.get('token')?.value;
  const showNav = !!token;

  return (
    <html lang="en">
      <body className="bg-gray-50 text-gray-900">
        <div className="flex min-h-screen">
          {showNav && <Nav />}
          <main className="flex-1 overflow-auto">{children}</main>
        </div>
        {showNav && <SseWatcher />}
      </body>
    </html>
  );
}
