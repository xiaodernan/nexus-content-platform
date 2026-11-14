import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { CommandPalette } from '@/components/CommandPalette';
import { KeyboardCheatsheet } from '@/components/KeyboardCheatsheet';
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
      <body className="rx-body">
        <ThemeScript />
        {children}
        {/* §CP-1：全站命令面板。挂在 layout 而不是逐页挂——它的价值全在"哪一页都能按"，
            少挂一页就少一条入口，而漏挂不会报错，只会悄悄少一路。 */}
        <CommandPalette />
        <KeyboardCheatsheet />
        <ThemeToggle />
      </body>
    </html>
  );
}
