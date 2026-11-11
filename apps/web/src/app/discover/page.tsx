import Link from 'next/link';
import Image from 'next/image';
import { discover, type DiscoverSort } from '@/server/domain/social';
import { currentUserOrNull } from '@/server/domain/session';
import { publicAssetUrl } from '@/studio/assets';

export const dynamic = 'force-dynamic';

/**
 * §61 发现页。四个排得出来的排序做成了标签；排不出来的（AI Picks）
 * 原样列在页面上并说明为什么排不出来——留空位或藏起来，都会被读成"平台没有这个功能"。
 *
 * Trending 以前也在那张"排不出来"的单子上，理由是"只有累计数"；
 * 现在按天的互动序列是真的（点赞/评论/收藏/改编各有 created_at，访问按访客 × 天存），
 * 所以能排——但**算法参数与候选集上限必须一起显示**（`result.method`），
 * 否则一个折了时间衰减的序就会被读成"平台公认最热"。
 */
const TABS: { id: DiscoverSort; label: string }[] = [
  { id: 'new', label: '最新发布' },
  { id: 'popular', label: '最多人看/赞' },
  { id: 'trending', label: '最近最热' },
  { id: 'following', label: '我关注的作者' },
];

export default async function DiscoverPage({ searchParams }: { searchParams: Promise<{ sort?: string }> }) {
  const query = await searchParams;
  const sort: DiscoverSort = TABS.some((t) => t.id === query.sort) ? (query.sort as DiscoverSort) : 'new';
  const viewer = await currentUserOrNull();
  const result = await discover({ sort, viewerId: viewer?.id ?? null });

  return (
    <main className="mx-auto flex max-w-[1080px] flex-col gap-[var(--nexus-space-6)] px-6 py-10" data-discover-root>
      <header className="flex flex-wrap items-baseline gap-3">
        <h1 className="relative inline-block bg-gradient-to-br from-[#eef1f6] via-[#8b9cf8] to-[var(--nexus-color-accent-1)] bg-clip-text pb-2 text-[var(--nexus-font-size-28)] font-bold tracking-tight text-transparent" data-discover-title>
          发现
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-[var(--nexus-color-brand)] to-transparent opacity-70"
          />
        </h1>
        <nav className="flex gap-2" data-discover-tabs>
          {TABS.map((tab) => (
            <Link
              key={tab.id}
              href={`/discover?sort=${tab.id}`}
              data-discover-tab={tab.id}
              data-current={tab.id === result.sort ? 'true' : 'false'}
              className={`rounded px-2 py-1 text-12 ${tab.id === result.sort ? 'bg-accent-2 text-accent-fg' : 'bg-bg-2 text-fg-2'}`}
            >
              {tab.label}
            </Link>
          ))}
        </nav>
        <Link
          href="/search"
          className="inline-flex min-h-6 items-center rounded px-1 text-12 text-accent-2-ink underline"
          data-search-link
        >
          按关键词搜全平台
        </Link>
      </header>

      {result.cards.length === 0 ? (
        <div
          className="flex flex-col items-start gap-3 rounded-xl border border-[var(--nexus-color-border-subtle)] bg-gradient-to-br from-bg-1 via-bg-2 to-bg-1 p-6"
          data-discover-empty
        >
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-[var(--nexus-color-border-strong)] bg-bg-2 text-[var(--nexus-color-accent-2-ink)]">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 3l2.6 5.26L20.4 9.6l-4.28 3.86.84 5.7L12 16.2 6.99 19.16l.84-5.7L3.6 9.6l5.8-1.34L12 3z" />
            </svg>
          </span>
          <p className="text-14 font-medium text-fg-1">
            {result.sort === 'following' ? '你关注的作者还没有公开作品。' : '还没有公开的作品。'}
          </p>
          <p className="max-w-md text-13 leading-6 text-fg-2">
            {result.sort === 'following'
              ? '关注更多作者，这里就会有内容长出来。'
              : '这个列表只收真正放出去、且没被人工拒绝的页面。'}
          </p>
          <Link
            href="/u"
            className="mt-1 inline-flex items-center rounded-lg border border-[var(--nexus-color-border-strong)] bg-bg-2 px-4 py-2 text-13 font-medium text-fg-1 transition-colors hover:border-[var(--nexus-color-brand)]"
          >
            浏览全站作者 →
          </Link>
        </div>
      ) : null}

      {result.method ? (
        <p className="text-11 text-fg-3" data-discover-method>
          这个榜的排法：{result.method}
        </p>
      ) : null}

      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3" data-discover-grid>
        {result.cards.map((card) => (
          <li key={card.publicationId} data-discover-card={card.path}>
            <Link href={card.path} className="group flex h-full flex-col gap-1 overflow-hidden rounded-xl border border-[var(--nexus-color-border-subtle)] bg-bg-1 transition-all duration-200 hover:-translate-y-0.5 hover:border-[var(--nexus-color-brand)] hover:shadow-[0_18px_48px_rgb(91_108_255/0.22)]">
              {/* §927 封面图：有就显示，没有就留一个占位 */}
              {card.coverAssetId && card.ownerHandle ? (
                <div className="relative aspect-video w-full overflow-hidden bg-bg-2">
                  <Image
                    src={publicAssetUrl(card.ownerHandle, card.coverAssetId)}
                    alt={card.name}
                    fill
                    sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                    className="object-cover transition-transform duration-500 group-hover:scale-[1.04]"
                  />
                </div>
              ) : (
                <div className="flex aspect-video w-full items-center justify-center bg-gradient-to-br from-[var(--nexus-color-brand)]/20 via-bg-2 to-[var(--nexus-color-accent-1)]/15 text-18 font-bold tracking-wide text-fg-3">
                  {card.name.slice(0, 1)}
                </div>
              )}
              <div className="flex flex-col gap-1 p-3">
                <span className="text-13 font-semibold text-fg-1 transition-colors group-hover:text-[#eef1f6]" data-discover-name>
                  {card.name}
                </span>
                <span className="text-11 text-fg-3">
                  {card.owner} · {card.kind} · {new Date(card.publishedAt).toLocaleDateString('zh-CN')}
                </span>
                <span className="mt-auto flex flex-wrap items-center gap-x-2 gap-y-0.5 text-11 text-fg-2" data-discover-counts>
                  <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--nexus-color-accent-2-ink)]" aria-hidden="true"><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6z" /><circle cx="12" cy="12" r="2.75" /></svg>
                  {card.views}
                  <svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor" className="text-[#f47b8f]" aria-hidden="true"><path d="M12 20s-6.8-4.7-9-9.3C1.8 7.3 4.1 5 7 5c2 0 3.9 1.1 5 2.9C13.1 6.1 15 5 17 5c2.9 0 5.2 2.3 4 5.7C18.9 15.3 12 20 12 20z" /></svg>
                  {card.likes}
                  <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="text-fg-2" aria-hidden="true"><path d="M21 11.5a7.5 7.5 0 0 1-7.5 7.5 8 8 0 0 1-3.2-.7L4 20l1.7-6.2A7.5 7.5 0 1 1 21 11.5z" /></svg>
                  {card.comments}
                  <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="text-fg-2" aria-hidden="true"><path d="M12 3v18M7 8l5-5 5 5M7 16l5 5 5-5" /></svg>
                  {card.remixes}
                </span>
                {/* 分数只在"最近最热"这一栏有：它是算法输出，不是事实，所以连同排法一起显示 */}
                {card.score !== undefined ? (
                  <span className="text-11 text-fg-3" data-discover-score={card.score}>
                    热度分 {card.score}
                  </span>
                ) : null}
              </div>
            </Link>
          </li>
        ))}
      </ul>

      {result.hiddenAuthors > 0 ? (
        <p className="text-11 text-fg-3" data-discover-hidden={result.hiddenAuthors}>
          这次按你的屏蔽名单过滤掉了 {result.hiddenAuthors} 个人的作品 ·
          <a href="/blocks" className="ml-1 text-accent-2-ink underline">
            看看是谁
          </a>
        </p>
      ) : null}

      <section className="rounded-[var(--nexus-radius-sm)] bg-bg-2 p-3" data-discover-unavailable>
        <p className="text-12 text-fg-2">这些排序我们做不出来，不是忘了：</p>
        <ul className="mt-1 space-y-[2px]">
          {result.unavailable.map((item) => (
            <li className="text-11 text-fg-3" data-discover-gap={item.key} key={item.key}>
              · {item.key}：{item.reason}
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
