import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import Nav from '@/components/nav';
import SseWatcher from '@/components/sse-watcher';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  if (!cookieStore.get('token')?.value) {
    redirect('/login');
  }

  return (
    <div className="flex min-h-screen">
      <Nav />
      {/* pt-14 on mobile reserves space for the fixed top bar rendered by Nav */}
      <main className="flex-1 overflow-auto min-h-screen pt-14 md:pt-0">
        {children}
      </main>
      <SseWatcher />
    </div>
  );
}
