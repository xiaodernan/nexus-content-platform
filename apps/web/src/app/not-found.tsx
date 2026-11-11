import Link from 'next/link';

/**
 * The 404 page the platform shows when a URL matches nothing it knows about.
 *
 * Why this is its own file and not the Next.js default: the default is a trace of someone else's
 * design language, and the first thing a lost user sees is a blank canvas with the word "404" on it —
 * which tells them the platform isn't maintained to the level it claims. This one is branded,
 * minimal, and gives two honest recovery paths: back to home, and to Discover (the public shell).
 */
export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-[70vh] max-w-2xl flex-col items-center justify-center gap-[var(--nexus-space-5)] px-6 py-16 text-center">
      {/* the ambient glow — pure CSS, no images, no brand marks invented */}
      <div aria-hidden="true" className="pointer-events-none absolute -z-10 h-64 w-64 rounded-full bg-[radial-gradient(circle,rgb(91_108_255/0.18),transparent_70%)] blur-3xl" />
      <span className="font-mono text-[72px] font-black leading-none tracking-tighter text-transparent bg-gradient-to-br from-[var(--nexus-color-brand)] via-[var(--nexus-color-accent-1)] to-[var(--nexus-color-accent-2)] bg-clip-text select-none">
        404
      </span>
      <h1 className="text-[var(--nexus-font-size-21)] font-semibold text-fg-1">这片页面不存在</h1>
      <p className="max-w-md text-14 leading-6 text-fg-2">
        可能是链接过期了，也可能是输入有错——但无论哪一种，你不必自己猜下一步去哪儿。
      </p>
      <nav className="flex flex-wrap items-center justify-center gap-3">
        <Link
          href="/"
          className="inline-flex min-h-11 items-center rounded-lg border border-[var(--nexus-color-border-strong)] bg-bg-2 px-5 py-2 text-14 font-medium text-fg-1 transition-all duration-150 hover:border-[var(--nexus-color-brand)] hover:bg-bg-3 hover:shadow-[0_0_24px_rgb(91_108_255/0.2)]"
        >
          回到首页
        </Link>
        <Link
          href="/discover"
          className="inline-flex min-h-11 items-center rounded-lg bg-[var(--nexus-color-brand)] px-5 py-2 text-14 font-semibold text-[var(--nexus-color-accent-fg)] transition-all duration-150 hover:shadow-[0_0_30px_rgb(91_108_255/0.45)]"
        >
          去发现页
        </Link>
      </nav>
      <p className="font-mono text-10 text-fg-3">
        §159 — 没有什么页面应该假装存在；这里也不会。
      </p>
    </main>
  );
}
