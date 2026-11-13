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
    <main className="mx-auto flex min-h-[70vh] max-w-2xl flex-col items-center justify-center gap-[var(--nexus-space-5)] px-6 py-16 text-center">
      <div aria-hidden="true" className="pointer-events-none absolute -z-10 h-64 w-64 rounded-full bg-[radial-gradient(circle,rgb(242_85_90/0.14),transparent_70%)] blur-3xl" />
      <span className="font-mono text-[64px] font-black leading-none tracking-tighter text-[var(--nexus-color-danger-ink)] select-none">
        ⚠
      </span>
      <h1 className="text-[var(--nexus-font-size-21)] font-semibold text-fg-1">这片页面出错了</h1>
      <p className="max-w-md text-14 leading-6 text-fg-2">
        这不是你的操作问题——页面背后的那段代码抛了一个异常。我们已经在控制台留了痕迹，
        它会被下一次发布修掉。
      </p>
      {error.digest ? (
        <p className="font-mono text-10 text-fg-3">digest: {error.digest}</p>
      ) : null}
      <div className="flex flex-wrap items-center justify-center gap-3">
        <button
          type="button"
          onClick={reset}
          className="inline-flex min-h-11 items-center rounded-lg bg-[var(--nexus-color-brand)] px-5 py-2 text-14 font-semibold text-[var(--nexus-color-accent-fg)] transition-all duration-150 hover:shadow-[0_0_30px_rgb(91_108_255/0.45)]"
        >
          再试一次
        </button>
        <a
          href="/"
          className="inline-flex min-h-11 items-center rounded-lg border border-[var(--nexus-color-border-strong)] bg-bg-2 px-5 py-2 text-14 font-medium text-fg-1 transition-colors hover:border-[var(--nexus-color-brand)] hover:bg-bg-3"
        >
          回到首页
        </a>
      </div>
    </main>
  );
}
