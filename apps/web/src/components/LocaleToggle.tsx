'use client';

import { useEffect, useState } from 'react';

/**
 * 语言切换 FAB —— 中文 ↔ English。
 *
 * 为什么是整页 reload：翻译字典在每次渲染重新合成（§i18n 页签是 RSC），
 * 一个 client 切换只会让 localStorage 与 server 对不齐——`router.refresh()` 不总是
 * 在 layout 这层继承下去；整页重载是最朴素且不会掉皮肤的做法。
 */
export function LocaleToggle() {
  const [locale, setLocale] = useState<'zh' | 'en'>('zh');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const current = document.documentElement.getAttribute('lang');
    if (current === 'en' || current === 'zh-CN') setLocale(current === 'en' ? 'en' : 'zh');
    setReady(true);
  }, []);

  async function toggle(): Promise<void> {
    const next: 'zh' | 'en' = locale === 'zh' ? 'en' : 'zh';
    try {
      const response = await fetch('/api/locale', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ locale: next }),
      });
      if (!response.ok) return; // 写 cookie 失败不硬跳，UI 维持现状
    } catch {
      return;
    }
    window.location.reload();
  }

  const label = locale === 'zh' ? 'Switch to English' : '切换到中文';
  return (
    <button
      type="button"
      onClick={() => { void toggle(); }}
      data-locale-toggle={locale}
      data-locale-toggle-ready={ready ? '1' : undefined}
      aria-label={label}
      title={label}
      className="tt-fab"
    >
      {locale === 'zh' ? 'EN' : '中'}
    </button>
  );
}
