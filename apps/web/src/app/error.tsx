'use client';

import { useEffect } from 'react';
import { clientLocale } from '@/lib/client-locale';
import type { Locale } from '@/lib/i18n';

/**
 * Root error boundary — the last honest state a page can be in when something inside it threw.
 * Shows a real message in product language; the stack trace goes to the console only (users don't
 * need it; the responder — that's a human, not an AI — can read it from there).
 *
 * 双语（2026-11-15 公开试玩面 wave）：locale 从文档 lang 同步读；缺省 zh，与 RSC 缺省一致。
 */
const COPY: Record<Locale, {
  title: string;
  body: string;
  retry: string;
  home: string;
}> = {
  zh: {
    title: '这片页面出错了',
    body: '这不是你的操作问题——页面背后的那段代码抛了一个异常。我们已经在控制台留了痕迹，它会被下一次发布修掉。',
    retry: '再试一次',
    home: '回到首页',
  },
  en: {
    title: 'This page broke',
    body: 'Not your fault — something behind the page threw. The trace is in the console; the next deploy fixes it.',
    retry: 'Try again',
    home: 'Back to home',
  },
};

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  // 根级错误兜底：文档语言每次挂载同步直读（零 React 状态，zh-first 缺省与服务端一致）
  const c = COPY[clientLocale()];
  useEffect(() => {
    // §166-style: the console is where responders go, not the DOM.
    console.error('[NEXUS/app-root-error]', error);
  }, [error]);

  return (
    <main className="ge-shell">
      <div aria-hidden="true" className="ge-glow" />
      <span className="ge-mark">⚠</span>
      <h1 className="ge-title">{c.title}</h1>
      <p className="ge-body">
        {c.body}
      </p>
      {error.digest ? (
        <p className="ge-digest">digest: {error.digest}</p>
      ) : null}
      <div className="ge-actions">
        <button
          type="button"
          onClick={reset}
          className="ge-btnPrimary"
        >
          {c.retry}
        </button>
        <a
          href="/"
          className="ge-btnGhost"
        >
          {c.home}
        </a>
      </div>
    </main>
  );
}
