import { redirect } from 'next/navigation';
import { getTokenServerSide } from '@/lib/auth';
import { Sidebar } from '@/components/layout/Sidebar';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const token = getTokenServerSide();
  if (!token) redirect('/login');

  return (
    <div className="h-full flex flex-col">

      <div className="flex h-[calc(100%-41px)] relative">
        <Sidebar />
        <main className="min-w-0 flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
