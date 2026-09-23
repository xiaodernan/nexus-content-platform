import Link from 'next/link';
import { discover, type DiscoverSort } from '@/server/domain/social';
import { currentUserOrNull } from '@/server/domain/session';

export const dynamic = 'force-dynamic';

/**
 * §61 发现页。三个排得出来的排序做成了标签，排不出来的（Trending / AI Picks）
 * 原样列在页面上并说明为什么排不出来——留空位或藏起来，都会被读成"平台没有这个功能"，
 * 而事实是我们拒绝用累计浏览数冒充热度。
 */
const TABS: { id: DiscoverSort; label: string }[] = [
  { id: 'new', label: '最新发布' },
  { id: 'popular', label: '最多人看/赞' },
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
        <h1 className="text-[var(--nexus-font-size-20)] font-semibold">发现</h1>
        <nav className="flex gap-2" data-discover-tabs>
          {TABS.map((tab) => (
            <Link
              key={tab.id}
              href={`/discover?sort=${tab.id}`}
              data-discover-tab={tab.id}
              data-current={tab.id === result.sort ? 'true' : 'false'}
              className={`rounded px-2 py-1 text-12 ${tab.id === result.sort ? 'bg-accent-2 text-fg-1' : 'bg-bg-2 text-fg-2'}`}
            >
              {tab.label}
            </Link>
          ))}
        </nav>
      </header>

      {result.cards.length === 0 ? (
        <p className="text-13 text-fg-2" data-discover-empty>
          {result.sort === 'following'
            ? '你关注的作者还没有公开作品。'
            : '还没有公开的作品。这个列表只收真正放出去、且没被人工拒绝的页面。'}
        </p>
      ) : null}

      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3" data-discover-grid>
        {result.cards.map((card) => (
          <li key={card.publicationId} data-discover-card={card.path}>
            <Link href={card.path} className="flex h-full flex-col gap-1 rounded border border-[var(--nexus-color-border-subtle)] bg-bg-1 p-3">
              <span className="text-13 font-semibold text-fg-1" data-discover-name>
                {card.name}
              </span>
              <span className="text-11 text-fg-3">
                {card.owner} · {card.kind} · {new Date(card.publishedAt).toLocaleDateString('zh-CN')}
              </span>
              <span className="mt-auto text-11 text-fg-2" data-discover-counts>
                {card.views} 次浏览 · {card.likes} 赞 · {card.comments} 评论 · {card.remixes} 改编
              </span>
            </Link>
          </li>
        ))}
      </ul>

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
