import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Sidebar } from "@/components/layout/Sidebar";
import { AlertBanner } from "@/components/layout/AlertBanner";
import { ToastProvider } from "@/components/ui/Toast";
import SseWatcher from "@/components/sse-watcher";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  if (!cookieStore.get("token")?.value) redirect("/login");

  return (
    <ToastProvider>
      <div className="flex h-full flex-col">
        <AlertBanner />
        <div className="flex min-h-0 flex-1">
          <Sidebar />
          <main className="min-w-0 flex-1 overflow-y-auto">{children}</main>
        </div>
      </div>
      <SseWatcher />
    </ToastProvider>
  );
}
