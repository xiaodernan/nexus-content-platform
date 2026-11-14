import Link from 'next/link';
import Image from 'next/image';
import { discoverCached, type DiscoverSort } from '@/server/domain/social';
import { currentUserOrNull } from '@/server/domain/session';
import { publicAssetUrl } from '@/studio/assets';
import { getLocale } from '@/lib/i18n';

export const dynamic = 'force-dynamic';

/**
 * §61 发现页——四个排得出来的排序做成了标签；排不出来的（AI Picks）
 * 原样列在页面上并说明为什么排不出来——留空位或藏起来，都会被读成"平台没有这个功能"。
 *
 * Trending 以前也在那张"排不出来"的单子上，理由是"只有累计数"；
 * 现在按天的互动序列是真的（点赞/评论/收藏/改编各有 created_at，访问按访客 × 天存），
 * 所以能排——但**算法参数与候选集上限必须一起显示**（`result.method`），
 * 否则一个折了时间衰减的序就会被读成"平台公认最热"。
 */
type Loc = 'zh' | 'en';

const TABS: Record<Loc, { id: DiscoverSort; label: string }[]> = {
  zh: [
    { id: 'new', label: '最新发布' },
    { id: 'popular', label: '最多人看/赞' },
    { id: 'trending', label: '最近最热' },
    { id: 'following', label: '我关注的作者' },
  ],
  en: [
    { id: 'new', label: 'Latest' },
    { id: 'popular', label: 'Most viewed' },
    { id: 'trending', label: 'Trending' },
    { id: 'following', label: 'Following' },
  ],
};

const COPY = {
  zh: {
    title: '发现',
    subtitle: '平台上正在放出的真实作品——每一张都来自一个创作者的公开橱窗，没有人替你点选。',
    searchCta: '按关键词搜全平台',
    emptyFollowing: '你关注的作者还没有公开作品。',
    emptyNothing: '还没有公开的作品。这个列表只收真正放出去、且没被人工拒绝的页面。',
    coverMissing: '暂无封面',
    methodPrefix: '这个榜的排法：',
    views: '次浏览',
    likes: '赞',
    comments: '评论',
    remixes: '改编',
    scoreLabel: '热度分',
    blocksPrompt: '看看是谁',
    blockedBy: '这次按你的屏蔽名单过滤掉了',
    blockedSuffix: '个人的作品 ·',
    unavailableHead: '这些排序我们做不出来，不是忘了：',
    localeToggleHint: 'Switch to English',
  },
  en: {
    title: 'Discover',
    subtitle: 'Real work that just got published — every card is a real creator’s public window; no one curates for you.',
    searchCta: 'Search by keyword across the platform',
    emptyFollowing: 'The creators you follow haven’t published anything yet.',
    emptyNothing: 'Nothing to show yet. Only real published pages that weren’t pulled by moderation make it here.',
    coverMissing: 'No cover',
    methodPrefix: 'How this is ranked:',
    views: 'views',
    likes: 'likes',
    comments: 'comments',
    remixes: 'remixes',
    scoreLabel: 'heat score',
    blocksPrompt: 'see who',
    blockedBy: 'Filtered out',
    blockedSuffix: 'creators you blocked ·',
    unavailableHead: 'These sorts aren’t possible yet — not by omission:',
    localeToggleHint: '切换到中文',
  },
} as const;

export default async function DiscoverPage({ searchParams }: { searchParams: Promise<{ sort?: string }> }) {
  const query = await searchParams;
  const locale = (await getLocale()) as Loc;
  const copy = COPY[locale];
  const tabs = TABS[locale];
  const sort: DiscoverSort = tabs.some((t) => t.id === query.sort) ? (query.sort as DiscoverSort) : 'new';
  const viewer = await currentUserOrNull();
  const result = await discoverCached({ sort, viewerId: viewer?.id ?? null });

  return (
    <main className="dv-root" data-discover-root data-discover-locale={locale}>
      <header className="dv-header">
        <h1 className="dv-title" data-discover-title>{copy.title}</h1>
        <p className="dv-subtitle">{copy.subtitle}</p>
        <nav className="dv-tabRow" data-discover-tabs aria-label={locale === 'zh' ? '发现页排序' : 'Sort options'}>
          {tabs.map((tab) => (
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
          {copy.searchCta}
        </Link>
      </header>

      {result.cards.length === 0 ? (
        <div className="dv-empty" data-discover-empty>
          <p className="dv-narrow">
            {result.sort === 'following' ? copy.emptyFollowing : copy.emptyNothing}
          </p>
        </div>
      ) : null}

      {result.method ? (
        <p className="dv-method" data-discover-method>
          {copy.methodPrefix}{result.method}
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
                  <div className="dv-coverFallback">{/* 封面缺席：留白不编造画面 */}{copy.coverMissing}</div>
                </div>
              )}
              <div className="dv-cardBody">
                <span className="dv-cardName" data-discover-name>
                  {card.name}
                </span>
                <span className="dv-cardMeta">
                  {card.owner} · {card.kind} · {new Date(card.publishedAt).toLocaleDateString(locale === 'zh' ? 'zh-CN' : 'en-US')}
                </span>
                <span className="dv-cardCounts" data-discover-counts>
                  {card.views} {copy.views} · {card.likes} {copy.likes} · {card.comments} {copy.comments} · {card.remixes} {copy.remixes}
                </span>
                {/* 分数只在"最近最热"这一栏有：它是算法输出，不是事实，所以连同排法一起显示 */}
                {card.score !== undefined ? (
                  <span className="dv-cardScore" data-discover-score={card.score}>
                    {copy.scoreLabel} {card.score}
                  </span>
                ) : null}
              </div>
            </Link>
          </li>
        ))}
      </ul>

      {result.hiddenAuthors > 0 ? (
        <p className="dv-hint11" data-discover-hidden={result.hiddenAuthors}>
          {copy.blockedBy} {result.hiddenAuthors} {locale === 'zh' ? '个人的作品 · ' : 'creators · '}
          <a href="/blocks" className="dv-inlineLink">
            {copy.blocksPrompt}
          </a>
        </p>
      ) : null}

      <section className="dv-unavailable" data-discover-unavailable>
        <p className="dv-bodyInk">{copy.unavailableHead}</p>
        <ul className="dv-gapList">
          {result.unavailable.map((item) => (
            <li className="dv-hint11" data-discover-gap={item.key} key={item.key}>
              · {item.key}：{item.reason}
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}

