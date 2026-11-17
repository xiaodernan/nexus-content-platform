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
      <head>
        {/* 真实字体：token 声明的 Inter / JetBrains Mono 此前从未被加载（fallback 到系统字体，样式发虚）。
            中文正文/标题走 Noto Sans SC / Noto Serif SC 兜底，避免机器无 PingFang/YaHei 时的字形断层。
            网络不通时 fallback 栈兜住，不阻塞渲染（display=swap）。 */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;550;650;700&family=JetBrains+Mono:wght@400;600;700&family=Noto+Sans+SC:wght@400;500;600;700&family=Noto+Serif+SC:wght@600;700&display=swap"
        />
      </head>
      <body className="rx-body">
        <ThemeScript />
        {children}
        {/* 全局命令面板 / 快捷键速览 / 主题 / 语言：layout 收口 */}
        <CommandPalette locale={locale} />
        <KeyboardCheatsheet locale={locale} />
        <LocaleToggle />
        <ThemeToggle locale={locale} />
      </body>
    </html>
  );
}
