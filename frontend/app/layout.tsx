import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';


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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="bg-[#0A0E1A] text-slate-100 font-sans antialiased">
        {children}
      </body>
    </html>
  );
}
