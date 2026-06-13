import type { Metadata } from "next";
import "./globals.css";
import { Sidebar } from "@/components/layout/Sidebar";
import { AlertBanner } from "@/components/layout/AlertBanner";
import { ToastProvider } from "@/components/ui/Toast";

export const metadata: Metadata = {
  title: "DataAutomated — Intelligence",
  description: "Voice of Customer, Competitive, and Journey intelligence.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full">
      <body className="h-full bg-slate-900 text-slate-200 antialiased">
        <ToastProvider>
          {/* Global error / disconnect surface — very top of the shell. */}
          <AlertBanner />
          <div className="flex h-full">
            <Sidebar />
            <main className="min-w-0 flex-1 overflow-y-auto">{children}</main>
          </div>
        </ToastProvider>
      </body>
    </html>
  );
}
