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
        <h1 className="text-[var(--nexus-font-size-21)] font-semibold">发现</h1>
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
        <Link href="/search" className="text-12 text-accent-2 underline" data-search-link>
          按关键词搜全平台
        </Link>
      </header>

      {result.cards.length === 0 ? (
        <p className="text-13 text-fg-2" data-discover-empty>
          {result.sort === 'following'
            ? '你关注的作者还没有公开作品。'
            : '还没有公开的作品。这个列表只收真正放出去、且没被人工拒绝的页面。'}
        </p>
      ) : null}

      {result.method ? (
        <p className="text-11 text-fg-3" data-discover-method>
          这个榜的排法：{result.method}
        </p>
      ) : null}

      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3" data-discover-grid>
        {result.cards.map((card) => (
          <li key={card.publicationId} data-discover-card={card.path}>
            <Link href={card.path} className="flex h-full flex-col gap-1 rounded border border-[var(--nexus-color-border-subtle)] bg-bg-1 overflow-hidden">
              {/* §927 封面图：有就显示，没有就留一个占位 */}
              {card.coverAssetId && card.ownerHandle ? (
                <div className="relative aspect-video w-full bg-bg-2">
                  <Image
                    src={publicAssetUrl(card.ownerHandle, card.coverAssetId)}
                    alt={card.name}
                    fill
                    sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                    className="object-cover"
                  />
                </div>
              ) : (
                <div className="aspect-video w-full bg-bg-2 flex items-center justify-center text-fg-3 text-11">无封面</div>
              )}
              <div className="p-3 flex flex-col gap-1">
                <span className="text-13 font-semibold text-fg-1" data-discover-name>
                  {card.name}
                </span>
                <span className="text-11 text-fg-3">
                  {card.owner} · {card.kind} · {new Date(card.publishedAt).toLocaleDateString('zh-CN')}
                </span>
                <span className="mt-auto text-11 text-fg-2" data-discover-counts>
                  {card.views} 次浏览 · {card.likes} 赞 · {card.comments} 评论 · {card.remixes} 改编
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
          <a href="/blocks" className="ml-1 text-accent-2 underline">
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
