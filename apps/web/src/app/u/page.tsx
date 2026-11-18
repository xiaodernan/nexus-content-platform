import Link from 'next/link';
import type { Metadata } from 'next';
import { listPublicAuthorsForShowcase } from '@/server/domain/profile';
import { BrandTitle } from '@/components/BrandTitle';
import { getLocale, type Locale } from '@/lib/i18n';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  return {
    title: locale === 'en' ? 'Creator showcase · NEXUS' : '创作者广场 · NEXUS',
    description:
      locale === 'en'
        ? 'Authors with real public works — ordered by latest publish time; empty shelves are not listed.'
        : '真有过公开作品的账户——按最新公开时间排序，空台子不列。',
  };
}

/**
 * 双语 COPY（2026-11-15 公开试玩面 wave）：lang cookie 决定；缺省 zh 与 RSC 缺省一致；
 * 账号名/bio 是内容本身，原文渲染；计数单位两语各自成全。
 */
const COPY: Record<Locale, {
  eyebrow: string;
  title: string;
  lede: string;
  emptyTitle: string;
  emptyText: string;
  emptyLink: string;
  bioEmpty: string;
  worksSuffix: string;
  followersSuffix: string;
}> = {
  zh: {
    eyebrow: 'SHOWCASE',
    title: '创作者广场',
    lede: '真的有人在这里放了真东西——按最新公开时间排序。点开一个人就能看到TA的公开作品、世界、角色与游戏（如果有）。',
    emptyTitle: '广场目前还是空的。',
    emptyText: '没有公开过作品的账户不会出现在这里——不是我们的广场挑人，是这页要陈列的就是“已经有人落子”的事实。等你发布第一份真公开的作品，你就在里面了。',
    emptyLink: '去看看公开作品 →',
    bioEmpty: '这位作者没有留言简介。',
    worksSuffix: '公开',
    followersSuffix: ' 粉',
  },
  en: {
    eyebrow: 'SHOWCASE',
    title: 'Creator showcase',
    lede: 'Real people really put real work here — ordered by latest publish. Click anyone to see their public works, worlds, characters and games (if any).',
    emptyTitle: 'The plaza is still empty.',
    emptyText: 'Accounts without public works don’t appear here — this page exists to show “someone has played here”, not to pick heroes. Publish your first public work, and you’re in the list.',
    emptyLink: 'See public works →',
    bioEmpty: 'This author left no bio.',
    worksSuffix: 'work(s)',
    followersSuffix: ' followers',
  },
};

/**
 * §60's "discovery on the author axis". Every card here answers a real question the platform can
 * answer truthfully: "which human made real things that are on the public square?". No guests,
 * no empty profiles, no fakes — the list is computed live from the same truth source as the
 * single-author page (`profileOf`), not assembled from a cache.
 *
 * 双语（2026-11-15 公开试玩面 wave）：locale 由 getLocale() 透传；标题/说明/空态/计数皆两套对齐。
 */
export default async function AuthorsShowcasePage() {
  const locale = await getLocale();
  const c = COPY[locale];
  const authors = await listPublicAuthorsForShowcase();

  return (
    <main className="am-shellGapXl" data-authors-root>
      <header className="adm-headBaseline">
        <div>
          <p className="ash-eyebrow">{c.eyebrow}</p>
          <BrandTitle>{c.title}</BrandTitle>
          <p className="ash-lede">
            {c.lede}
          </p>
        </div>
      </header>

      {authors.length === 0 ? (
        <div
          className="ash-emptyCard"
          data-authors-empty
        >
          <span className="ash-emptyIcon">
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 3l2.6 5.26L20.4 9.6l-4.28 3.86.84 5.7L12 16.2 6.99 19.16l.84-5.7L3.6 9.6l5.8-1.34L12 3z" />
            </svg>
          </span>
          <p className="ash-emptyTitle">{c.emptyTitle}</p>
          <p className="ash-emptyText">
            {c.emptyText}
          </p>
          <Link
            href="/discover"
            className="ash-emptyLink"
          >
            {c.emptyLink}
          </Link>
        </div>
      ) : (
        <ul className="ash-grid" data-authors-grid>
          {authors.map((a) => (
            <li key={a.id} data-author-card={a.id}>
              <Link
                href={a.handle ? `/u/${a.handle}` : '#'}
                className="ash-card"
              >
                <div className="ash-cardHead">
                  {a.avatarUrl ? (
                    <img src={a.avatarUrl} alt="" className="ash-avatar" />
                  ) : (
                    <span className="ash-avatarFallback">
                      {a.displayName.slice(0, 1).toUpperCase()}
                    </span>
                  )}
                  <div className="ash-cardBody">
                    <span className="ash-cardName" data-author-name>
                      {a.displayName}
                    </span>
                    {a.handle ? (
                      <span className="ash-handle">@{a.handle}</span>
                    ) : null}
                  </div>
                </div>
                {a.bio ? (
                  <p className="ash-bio" data-author-bio>
                    {a.bio}
                  </p>
                ) : (
                  <p className="ash-bioEmpty">{c.bioEmpty}</p>
                )}
                <span className="ash-counts" data-author-counts>
                  <span>{a.works} {c.worksSuffix}</span>
                  <span>·</span>
                  <span>{a.followers}{c.followersSuffix}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
