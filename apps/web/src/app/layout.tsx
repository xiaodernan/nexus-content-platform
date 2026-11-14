import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { getLocale } from '@/lib/i18n';
import { CommandPalette } from '@/components/CommandPalette';
import { KeyboardCheatsheet } from '@/components/KeyboardCheatsheet';
import { ThemeScript } from '@/components/ThemeScript';
import { ThemeToggle } from '@/components/ThemeToggle';
import { LocaleToggle } from '@/components/LocaleToggle';
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

export default async function RootLayout({ children }: { children: ReactNode }) {
  const locale = await getLocale();
  return (
    <html lang={locale === 'en' ? 'en' : 'zh-CN'} data-nexus-theme="dark" suppressHydrationWarning>
      <body className="rx-body">
        <ThemeScript />
        {children}
        {/* 全局命令面板 / 快捷键速览 / 主题 / 语言：layout 收口 */}
        <CommandPalette />
        <KeyboardCheatsheet />
        <LocaleToggle />
        <ThemeToggle />
      </body>
    </html>
  );
}
