'use client';

import { useEffect } from 'react';

/** Root error boundary — the last honest state a page can be in when something inside it threw.
 * Shows a real message in product language; the stack trace goes to the console only (users don't
 * need it; the responder — that's a human, not an AI — can read it from there).
 *
 * 双语：异常页是静态的（client 组件，SSR 期间没有 cookie/header 可读），所以两个语言都印出来；
 * `lang` 属性分别标注，读屏按各自语言念。
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // §166-style: the console is where responders go, not the DOM.
    console.error('[NEXUS/app-root-error]', error);
  }, [error]);

  return (
    <main className="ge-shell">
      <div aria-hidden="true" className="ge-glow" />
      <span className="ge-mark">⚠</span>
      <h1 className="ge-title" lang="zh-CN">
        这片页面出错了
      </h1>
      <h1 className="ge-title" lang="en">
        This page hit an error
      </h1>
      <p className="ge-body" lang="zh-CN">
        这不是你的操作问题——页面背后的那段代码抛了一个异常。我们已经在控制台留了痕迹，它会被下一次发布修掉。
      </p>
      <p className="ge-body" lang="en">
        This is not something you did — the code behind this page threw an exception. A trace is already in the console, and the next release will fix it.
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
          再试一次 · Try again
        </button>
        <a
          href="/"
          className="ge-btnGhost"
        >
          回到首页 · Home
        </a>
      </div>
    </main>
  );
}
