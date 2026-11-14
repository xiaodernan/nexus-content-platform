import Link from 'next/link';
import type { Metadata } from 'next';
import { listPublicAuthorsForShowcase } from '@/server/domain/profile';
import { BrandTitle } from '@/components/BrandTitle';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: '创作者广场 · NEXUS',
  description: '真有过公开作品的账户——按最新公开时间排序，空台子不列。',
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
    <main className="am-shellGapXl" data-authors-root>
      <header className="adm-headBaseline">
        <div>
          <p className="ash-eyebrow">SHOWCASE</p>
          <BrandTitle>创作者广场</BrandTitle>
          <p className="ash-lede">
            真的有人在这里放了真东西——按最新公开时间排序。点开一个人就能看到TA的公开作品、世界、角色与游戏（如果有）。
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
          <p className="ash-emptyTitle">广场目前还是空的。</p>
          <p className="ash-emptyText">
            没有公开过作品的账户不会出现在这里——不是我们的广场挑人，是这页要陈列的就是&ldquo;已经有人落子&rdquo;的事实。等你发布第一份真公开的作品，你就在里面了。
          </p>
          <Link
            href="/discover"
            className="ash-emptyLink"
          >
            去看看公开作品 →
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
                  <p className="ash-bioEmpty">这位作者没有留言简介。</p>
                )}
                <span className="ash-counts" data-author-counts>
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
