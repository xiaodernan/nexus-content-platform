import Link from 'next/link';
import type { Metadata } from 'next';
import { listPublicAuthorsForShowcase } from '@/server/domain/profile';
import { BrandTitle } from '@/components/BrandTitle';
import { getLocale } from '@/lib/i18n';

export const dynamic = 'force-dynamic';

/** 双语：每行文案按 cookie locale 选（不夹杂） */
const UH_TXT = {
  zh: {
    metadataTitle: '创作者广场 · NEXUS',
    metadataDescription: '真有过公开作品的账户——按最新公开时间排序，空台子不列。',
    title: '创作者广场',
    lede: '真的有人在这里放了真东西——按最新公开时间排序。点开一个人就能看到TA的公开作品、世界、角色与游戏（如果有）。',
    emptyTitle: '广场目前还是空的。',
    emptyText:
      '没有公开过作品的账户不会出现在这里——不是我们的广场挑人，是这页要陈列的就是“已经有人落子”的事实。等你发布第一份真公开的作品，你就在里面了。',
    emptyLink: '去看看公开作品 →',
    bioEmpty: '这位作者没有留言简介。',
    publicCount: '公开',
    followers: '粉',
  },
  en: {
    metadataTitle: 'Creators Square · NEXUS',
    metadataDescription: 'Accounts with genuinely published works — sorted by latest publication time; empty pedestals are not listed.',
    title: 'Creators Square',
    lede: 'Real people put real things here — sorted by latest publication time. Open a profile to see their public works, worlds, characters and games (if any).',
    emptyTitle: 'The square is still empty.',
    emptyText:
      'Accounts that never published do not appear here — it is not that the square curates; this page only displays the fact “someone has placed a first move”. Publish your first genuinely public work, and you are in.',
    emptyLink: 'See the public works →',
    bioEmpty: 'This author left no bio.',
    publicCount: 'public',
    followers: 'followers',
  },
} as const;

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  const T = UH_TXT[locale];
  return { title: T.metadataTitle, description: T.metadataDescription };
}

/**
 * §60's "discovery on the author axis". Every card here answers a real question the platform can
 * answer truthfully: "which human made real things that are on the public square?". No guests,
 * no empty profiles, no fakes — the list is computed live from the same truth source as the
 * single-author page (`profileOf`), not assembled from a cache.
 */
export default async function AuthorsShowcasePage() {
  const locale = await getLocale();
  const T = UH_TXT[locale];
  const authors = await listPublicAuthorsForShowcase();

  return (
    <main className="am-shellGapXl" data-authors-root>
      <header className="adm-headBaseline">
        <div>
          <p className="ash-eyebrow">SHOWCASE</p>
          <BrandTitle>{T.title}</BrandTitle>
          <p className="ash-lede">
            {T.lede}
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
          <p className="ash-emptyTitle">{T.emptyTitle}</p>
          <p className="ash-emptyText">
            {T.emptyText}
          </p>
          <Link
            href="/discover"
            className="ash-emptyLink"
          >
            {T.emptyLink}
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
                  <p className="ash-bioEmpty">{T.bioEmpty}</p>
                )}
                <span className="ash-counts" data-author-counts>
                  <span>{a.works} {T.publicCount}</span>
                  <span>·</span>
                  <span>{a.followers} {T.followers}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
