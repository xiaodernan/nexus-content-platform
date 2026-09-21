import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import './globals.css';

export const metadata: Metadata = {
  title: 'NEXUS — AI Universe Studio',
  description: 'Describe it. Design it. Generate it. Build it. Enter it.',
};

export const viewport: Viewport = {
  themeColor: '#0a0b10',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-CN" data-nexus-theme="dark">
      <body className="min-h-screen bg-bg-0 text-fg-1 antialiased">{children}</body>
    </html>
  );
}
