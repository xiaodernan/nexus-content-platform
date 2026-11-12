import Link from 'next/link';
import type { Metadata } from 'next';
import { listPublicAuthorsForShowcase } from '@/server/domain/profile';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: '创作者广场 · NEXUS',
  description: '真有过公开作品的账户——按最新公开时间排，空台子不列。',
};

/**
 * §60's "discovery on the author axis". Every card here answers a real question the platform can
 * answer truthfully: "which human made real things that are on the public square?". No guests,
 * no empty profiles, no fakes — the list is computed live from the same truth source as the
 * single-author page (`profileOf`), not assembled from a cache.
 */
export default async function AuthorsShowcasePage() {
  const authors = await listPublicAuthorsForShowcase();

  return (
    <main className="mx-auto flex max-w-[1080px] flex-col gap-[var(--nexus-space-6)] px-6 py-10" data-authors-root>
      <header className="relative flex flex-col gap-2">
        <span className="font-mono text-10 uppercase tracking-[0.22em] text-[var(--nexus-color-accent-2-ink)]">
          SHOWCASE
        </span>
        <h1 className="relative inline-block text-gradient-brand pb-2 text-28 font-bold tracking-tight">
          创作者广场
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-[var(--nexus-color-brand)] to-transparent opacity-70"
          />
        </h1>
        <p className="max-w-lg text-13 leading-6 text-fg-2">
          真的有人在这里放了真东西——按最新公开时间排。点开一个人就能看到TA的公开作品、世界、角色与游戏（如果有）。
        </p>
      </header>

      {authors.length === 0 ? (
        <div
          className="flex flex-col items-start gap-3 rounded-2xl border border-[var(--nexus-color-border-subtle)] bg-gradient-to-br from-bg-1 via-bg-2 to-bg-1 p-8"
          data-authors-empty
        >
          <span className="inline-flex h-12 w-12 items-center justify-center rounded-xl border border-[var(--nexus-color-border-strong)] bg-bg-2 text-[var(--nexus-color-accent-2-ink)]">
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 3l2.6 5.26L20.4 9.6l-4.28 3.86.84 5.7L12 16.2 6.99 19.16l.84-5.7L3.6 9.6l5.8-1.34L12 3z" />
            </svg>
          </span>
          <p className="text-15 font-semibold text-fg-1">广场目前还是空的。</p>
          <p className="max-w-md text-13 leading-6 text-fg-2">
            没有公开过作品的账户不会出现在这里——不是我们的广场挑人，是这页要陈列的就是&ldquo;已经有人落子&rdquo;的事实。等你发布第一份真公开的作品，你就在里面了。
          </p>
          <Link
            href="/discover"
            className="mt-1 inline-flex min-h-10 items-center rounded-lg bg-[var(--nexus-color-brand)] px-4 py-2 text-13 font-semibold text-[var(--nexus-color-accent-fg)] transition-all hover:shadow-[0_0_24px_rgb(91_108_255/0.45)]"
          >
            去看看公开作品 →
          </Link>
        </div>
      ) : (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3" data-authors-grid>
          {authors.map((a) => (
            <li key={a.id} data-author-card={a.id}>
              <Link
                href={a.handle ? `/u/${a.handle}` : '#'}
                className="group flex h-full flex-col gap-3 rounded-xl border border-[var(--nexus-color-border-subtle)] bg-bg-1 p-4 transition-all duration-200 hover:-translate-y-0.5 hover:border-[var(--nexus-color-brand)] hover:shadow-[0_18px_48px_rgb(91_108_255/0.22)]"
              >
                <div className="flex items-start gap-3">
                  {a.avatarUrl ? (
                    <img src={a.avatarUrl} alt="" className="h-14 w-14 rounded-full border border-[var(--nexus-color-border-strong)] object-cover" />
                  ) : (
                    <span className="flex h-14 w-14 items-center justify-center rounded-full border border-[var(--nexus-color-brand)]/40 bg-gradient-to-br from-[var(--nexus-color-brand)] via-[var(--nexus-color-accent-1)] to-[var(--nexus-color-accent-2)] text-16 font-bold text-[var(--nexus-color-accent-fg)] shadow-[0_0_20px_rgb(91_108_255/0.3)]">
                      {a.displayName.slice(0, 1).toUpperCase()}
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <span className="block truncate text-15 font-semibold text-fg-1 transition-colors group-hover:text-fg-1" data-author-name>
                      {a.displayName}
                    </span>
                    {a.handle ? (
                      <span className="mt-0.5 font-mono text-11 text-[var(--nexus-color-accent-2-ink)]">@{a.handle}</span>
                    ) : null}
                  </div>
                </div>
                {a.bio ? (
                  <p className="line-clamp-2 text-12 leading-5 text-fg-2" data-author-bio>
                    {a.bio}
                  </p>
                ) : (
                  <p className="text-12 text-fg-3">这位作者没有留言简介。</p>
                )}
                <span className="mt-auto flex items-center gap-3 font-mono text-11 text-fg-3" data-author-counts>
                  <span>{a.works} 公开</span>
                  <span>·</span>
                  <span>{a.followers} 粉</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
