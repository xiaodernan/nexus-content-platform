'use client';

import { useEffect } from 'react';

/**
 * Root error boundary — the last honest state a page can be in when something inside it threw.
 * Shows a real message in product language; the stack trace goes to the console only (users don't
 * need it; the responder — that's a human, not an AI — can read it from there).
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
      <h1 className="ge-title">这片页面出错了</h1>
      <p className="ge-body">
        这不是你的操作问题——页面背后的那段代码抛了一个异常。我们已经在控制台留了痕迹，
        它会被下一次发布修掉。
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
          再试一次
        </button>
        <a
          href="/"
          className="ge-btnGhost"
        >
          回到首页
        </a>
      </div>
    </main>
  );
}
