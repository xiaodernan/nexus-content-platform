import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { ThemeScript } from '@/components/ThemeScript';
import { ThemeToggle } from '@/components/ThemeToggle';
import './globals.css';

export const metadata: Metadata = {
  title: 'NEXUS — AI Universe Studio',
  description: 'Describe it. Design it. Generate it. Build it. Enter it.',
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: dark)', color: '#0a0b10' },
    { media: '(prefers-color-scheme: light)', color: '#f7f8fb' },
  ],
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-CN" data-nexus-theme="dark" suppressHydrationWarning>
      <body className="min-h-screen bg-bg-0 text-fg-1 antialiased">
        <ThemeScript />
        {children}
        <ThemeToggle />
      </body>
    </html>
  );
}
