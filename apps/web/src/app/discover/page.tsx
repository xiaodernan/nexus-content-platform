import Link from 'next/link';
import Image from 'next/image';
import { discoverCached, type DiscoverSort } from '@/server/domain/social';
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
  const result = await discoverCached({ sort, viewerId: viewer?.id ?? null });

  return (
    <main className="mx-auto flex w-full max-w-[1080px] flex-col gap-[var(--nexus-space-6)] px-6 py-10" data-discover-root>
      <header className="dv-header">
        <h1 className="dv-title" data-discover-title>发现</h1>
        <p className="dv-subtitle">平台上正在放出的真实作品——每一张都来自一个创作者的公开橱窗，没有人替你点选。</p>
        <nav className="dv-tabRow" data-discover-tabs aria-label="发现页排序">
          {TABS.map((tab) => (
            <Link
              key={tab.id}
              href={`/discover?sort=${tab.id}`}
              data-discover-tab={tab.id}
              data-current={tab.id === result.sort ? 'true' : 'false'}
              className={`dv-tab ${tab.id === result.sort ? 'dv-tabActive' : ''}`}
              aria-current={tab.id === result.sort ? 'page' : undefined}
            >
              {tab.label}
            </Link>
          ))}
        </nav>
        <Link href="/search" className="dv-searchPill" data-search-link>
          按关键词搜全平台
        </Link>
      </header>

      {result.cards.length === 0 ? (
        <div className="dv-empty" data-discover-empty>
          <p className="mx-auto max-w-md">
            {result.sort === 'following'
              ? '你关注的作者还没有公开作品。'
              : '还没有公开的作品。这个列表只收真正放出去、且没被人工拒绝的页面。'}
          </p>
        </div>
      ) : null}

      {result.method ? (
        <p className="dv-method" data-discover-method>
          这个榜的排法：{result.method}
        </p>
      ) : null}

      <ul className="dv-cardGrid" data-discover-grid>
        {result.cards.map((card) => (
          <li key={card.publicationId} data-discover-card={card.path}>
            <Link href={card.path} className="dv-card">
              {/* §927 封面图：有就显示，没有就留一个占位 */}
              {card.coverAssetId && card.ownerHandle ? (
                <div className="dv-coverWrap">
                  <Image
                    src={publicAssetUrl(card.ownerHandle, card.coverAssetId)}
                    alt={card.name}
                    fill
                    sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                    className="dv-cover"
                  />
                  <div className="dv-coverVeil" aria-hidden="true" />
                </div>
              ) : (
                <div className="dv-coverWrap">
                  <div className="dv-coverFallback">{/* 封面缺席：留白不编造画面 */}暂无封面</div>
                </div>
              )}
              <div className="dv-cardBody">
                <span className="dv-cardName" data-discover-name>
                  {card.name}
                </span>
                <span className="dv-cardMeta">
                  {card.owner} · {card.kind} · {new Date(card.publishedAt).toLocaleDateString('zh-CN')}
                </span>
                <span className="dv-cardCounts" data-discover-counts>
                  {card.views} 次浏览 · {card.likes} 赞 · {card.comments} 评论 · {card.remixes} 改编
                </span>
                {/* 分数只在"最近最热"这一栏有：它是算法输出，不是事实，所以连同排法一起显示 */}
                {card.score !== undefined ? (
                  <span className="dv-cardScore" data-discover-score={card.score}>
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

      <section className="dv-unavailable" data-discover-unavailable>
        <p className="text-12 text-fg-2">这些排序我们做不出来，不是忘了：</p>
        <ul className="mt-2 space-y-1">
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
