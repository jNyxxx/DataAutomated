import type { Metadata } from 'next';
import './globals.css';

// Root layout — App Router, server-first (CLAUDE.md §11, ADR-007).
export const metadata: Metadata = {
  title: 'DataAutomated.io',
  description: 'AI-powered business intelligence platform',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
