'use client';

import type { Locale } from '@/lib/i18n';

/**
 * 语言切换 FAB —— 中文 ↔ English。
 *
 * 为什么是整页 reload：翻译字典在每次渲染重新合成（§i18n 页签是 RSC），
 * 一个 client 切换只会让 localStorage 与 server 对不齐；`router.refresh()` 不总是
 * 在 layout 这层继承下去；整页重载是最朴素且不会掉皮肤的做法。
 *
 * 2026-11-22：locale 由 layout 作为 prop 传进来（服务端已读 cookie）。
 * 旧的 `useState('zh') + useEffect 读 document.lang` 会让英文模式的首屏先把按钮
 * 画成「EN / 切换到英文」，水合后才翻成「中 / Switch to Chinese」——既是闪烁，
 * 也让英文首屏短暂夹了中文 ARIA。现在 SSR 与水合后的第一帧就是同一种语言。
 */
export function LocaleToggle({ locale }: { locale: Locale }) {
  async function toggle(): Promise<void> {
    const next: Locale = locale === 'zh' ? 'en' : 'zh';
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

  // 可见字只写目标语言的名字（EN / 中）；提示语跟随当前界面语言，
  // 不在中文界面里放英文整句，也不在英文界面里放中文整句（§i18n 不夹杂）。
  const label = locale === 'zh' ? '切换到英文' : 'Switch to Chinese';
  return (
    <button
      type="button"
      onClick={() => { void toggle(); }}
      data-locale-toggle={locale}
      aria-label={label}
      title={label}
      className="tt-fab tt-fab-locale"
    >
      {locale === 'zh' ? 'EN' : '中'}
    </button>
  );
}
