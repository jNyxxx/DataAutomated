import { redirect } from 'next/navigation';
import { getTokenServerSide } from '@/lib/auth';
import { fetchClientInfo } from '@/lib/api';
import { Sidebar } from '@/components/layout/Sidebar';
import { InsightStream } from '@/components/realtime/InsightStream';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const token = await getTokenServerSide();
  if (!token) redirect('/login');

  const clientInfo = await fetchClientInfo(token).catch(() => ({ name: "Your account", plan: "", email: "" }));

  return (
    <div className="h-full flex flex-col">
      <div className="flex h-[calc(100%-41px)] relative">
        <Sidebar clientName={clientInfo.name} plan={clientInfo.plan} />
        <main className="min-w-0 flex-1 overflow-y-auto">
          {/* Mounts a Client Component that opens /api/stream and calls router.refresh() on new events */}
          <InsightStream />
          <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
