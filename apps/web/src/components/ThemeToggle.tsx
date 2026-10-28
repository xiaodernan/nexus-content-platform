'use client';

import { Moon, Sun } from 'lucide-react';
import { useEffect, useState } from 'react';
import { THEME_STORAGE_KEY, isTheme, type NexusTheme } from '@/lib/theme';

/**
 * §120 主题入口：一个按钮，暗 ↔ 浅。
 *
 * `data-theme-toggle-ready` 是给 e2e 的**水合屏障**：React 没接住点击之前按钮看起来一模一样，
 * 点下去会被静默丢掉（本仓 2026-10-28 反复踩过）。只有 useEffect 跑过才置 1。
 * 写 localStorage 失败（隐私模式）不影响本页生效，所以只在 catch 里静默——下一帧仍是新主题。
 */
export function ThemeToggle() {
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

  const label = theme === 'dark' ? '切换到浅色主题' : '切换到深色主题';
  return (
    <button
      type="button"
      onClick={toggle}
      data-theme-toggle={theme}
      data-theme-toggle-ready={ready ? '1' : undefined}
      aria-label={label}
      title={label}
      className="fixed bottom-3 right-3 z-40 inline-flex h-9 w-9 items-center justify-center rounded-full border border-border-subtle bg-bg-2/90 text-fg-2 shadow-sm backdrop-blur hover:text-fg-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-2-ink"
    >
      {theme === 'dark' ? <Sun size={16} aria-hidden /> : <Moon size={16} aria-hidden />}
    </button>
  );
}
