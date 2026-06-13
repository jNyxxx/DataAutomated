import { redirect } from 'next/navigation';
import { getTokenServerSide } from '@/lib/auth';
import { Sidebar } from '@/components/layout/Sidebar';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const token = getTokenServerSide();
  if (!token) redirect('/login');

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="ml-60 flex-1 p-8 min-w-0">
        {children}
      </main>
    </div>
  );
}
