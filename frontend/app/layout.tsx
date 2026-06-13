import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "DataAutomated — Intelligence",
  description: "Voice of Customer, Competitive, and Journey intelligence.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full">
      <body className="h-full bg-slate-900 text-slate-200 antialiased">
        {children}
      </body>
    </html>
  );
}
