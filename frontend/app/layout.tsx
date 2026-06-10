import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import Nav from '@/components/nav';
import SseWatcher from '@/components/sse-watcher';
import { cookies, headers } from 'next/headers';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
  weight: ['300', '400', '500', '600', '700', '800'],
});

export const metadata: Metadata = {
  title: 'DataAutomated.io — AI-Powered Business Intelligence',
  description: 'AI-powered business intelligence platform for revenue teams. Voice-of-Customer analysis, competitive signals, and journey intelligence — automated.',
  keywords: ['business intelligence', 'AI analytics', 'customer insights', 'competitive intelligence'],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const token = cookieStore.get('token')?.value;
  
  const headerList = await headers();
  const pathname = headerList.get('x-pathname') || '';
  const isLoginPage = pathname === '/login';
  const showNav = !!token && !isLoginPage;

  return (
    <html lang="en" className={inter.variable}>
      <body className="bg-[#0A0E1A] text-slate-100 font-sans antialiased">
        <div className="flex min-h-screen">
          {showNav && <Nav />}
          <main className="flex-1 overflow-auto min-h-screen">
            {children}
          </main>
        </div>
        {showNav && <SseWatcher />}
      </body>
    </html>
  );
}
