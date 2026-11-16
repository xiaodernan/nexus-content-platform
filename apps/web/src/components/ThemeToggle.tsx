'use client';

import { Moon, Sun } from 'lucide-react';
import { useEffect, useState } from 'react';
import { THEME_STORAGE_KEY, isTheme, type NexusTheme } from '@/lib/theme';
import type { Locale } from '@/lib/i18n';

/** 双语：按钮文案按 cookie locale 选（不夹杂） */
const THEME_TXT = {
  zh: { toLight: '切换到浅色主题', toDark: '切换到深色主题' },
  en: { toLight: 'Switch to light theme', toDark: 'Switch to dark theme' },
} as const;

/**
 * §120 主题入口：一个按钮，暗 ↔ 浅。
 *
 * `data-theme-toggle-ready` 是给 e2e 的**水合屏障**：React 没接住点击之前按钮看起来一模一样，
 * 点下去会被静默丢掉（本仓 2026-10-28 反复踩过）。只有 useEffect 跑过才置 1。
 * 写 localStorage 失败（隐私模式）不影响本页生效，所以只在 catch 里静默——下一帧仍是新主题。
 */
export function ThemeToggle({ locale = 'zh' }: { locale?: Locale }) {
  const T = THEME_TXT[locale];
  const [theme, setTheme] = useState<NexusTheme>('dark');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const current = document.documentElement.getAttribute('data-nexus-theme');
    if (isTheme(current)) setTheme(current);
    setReady(true);
  }, []);

  function toggle(): void {
    const next: NexusTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    document.documentElement.setAttribute('data-nexus-theme', next);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      /* 写不了也照样在本页生效，不把用户卡在旧主题里 */
    }
  }

  const label = theme === 'dark' ? T.toLight : T.toDark;
  return (
    <button
      type="button"
      onClick={toggle}
      data-theme-toggle={theme}
      data-theme-toggle-ready={ready ? '1' : undefined}
      aria-label={label}
      title={label}
      className="tt-fab"
    >
      {theme === 'dark' ? <Sun size={16} aria-hidden /> : <Moon size={16} aria-hidden />}
    </button>
  );
}
