import Link from 'next/link';
import { notFound } from 'next/navigation';
import { profileOf } from '@/server/domain/profile';
import { currentUserOrNull } from '@/server/domain/session';
import { FollowButton } from './FollowButton';
import { BlockControl } from './BlockControl';

export const dynamic = 'force-dynamic';

/**
 * §60 创作者主页：Avatar / Bio / Projects / Worlds / Characters / Games / Followers / Following。
 *
 * 每一栏都只放真公开的东西，理由写在页面上而不是只在这里：
 * 作品只列公网上传着的；世界与角色只列属于这些公开作品的、且只给名字与一句 tagline；
 * 游戏也只列公开作品：发布那一刻钉住了游戏设计的那几份给"试玩"入口（`/play` 真的能玩），
 * 只有设计稿的那几份照实写"没有可玩版本"——两种都列出来，不把没有的东西画成有。
 */
export default async function ProfilePage({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params;
  const viewer = await currentUserOrNull();
  const profile = await profileOf(decodeURIComponent(handle), viewer?.id ?? null);
  if (!profile) notFound();

  return (
    <main className="pf-root mx-auto flex max-w-[980px] flex-col gap-[var(--nexus-space-6)] px-6 py-10" data-profile-root>
      {/* §144 / ADR-0025：注销是"关上门"，不是"拆掉房子"——页面还开着，作品还在公网，
          但这一栏必须说清这个人已经不在了，否则读者会以为名字还能联系到本人 */}
      {profile.accountDeleted ? (
        <p
          className="pf-deleted"
          data-profile-deleted-banner
        >
          这个账号已经注销：作者名与个人简介不再显示，下面列出的作品仍在公网上传着、可以正常访问与阅读。
        </p>
      ) : null}
      <header className="pf-header" data-profile-header>
        {/* 头像：没有就是首字母，不放占位图（§159 不画假内容）；注销的账号连首字母也没有，因为那是本人的名字 */}
        {profile.avatarUrl ? (
          <img src={profile.avatarUrl} alt="" className="pf-avatar" data-profile-avatar="url" />
        ) : profile.accountDeleted ? null : (
          <span
            className="pf-avatar pf-avatarInitial"
            data-profile-avatar="initial"
          >
            {profile.name.slice(0, 1).toUpperCase()}
          </span>
        )}
        <div className="pf-identity">
          <h1 className="pf-name" data-profile-name>
            {profile.name}
          </h1>
          <p className="pf-handle">@{profile.handle}</p>
          {profile.accountDeleted ? null : (
            <p className="pf-bio" data-profile-bio>
              {profile.bio ?? '这位作者还没写简介。'}
            </p>
          )}
        </div>
        <div className="pf-actions">
          <span className="pf-counts" data-profile-counts>
            {profile.followers} 位粉丝 · 关注 {profile.following} 人
          </span>
          {profile.isSelf ? (
            <span className="pf-selfNote">这是你自己的主页</span>
          ) : (
            <>
              {/* §132：拉黑之后连"关注"这个按钮都不该还在——它只会回一句拒绝。
                  §144：账号注销之后同理，那个人不会再看到这条关注，也不会有人来接它 */}
              {profile.blockedByViewer === 'block' || profile.accountDeleted ? null : (
                <FollowButton
                  handle={profile.handle}
                  initialFollowing={profile.followingByViewer}
                  initialFollowers={profile.followers}
                />
              )}
              <BlockControl handle={profile.handle} initial={profile.blockedByViewer} />
            </>
          )}
        </div>
      </header>

      <section className="pf-section">
        <h2 className="pf-sectionTitle">公开作品（{profile.works.length}）</h2>
        {profile.works.length === 0 ? (
          <p className="pf-empty" data-profile-empty="works">
            还没有公开的作品。
          </p>
        ) : (
          <ul className="pf-works" data-profile-works>
            {profile.works.map((work) => (
              <li key={work.publicationId}>
                <Link href={work.path} className="pf-workCard" data-profile-work-card>
                  <span className="pf-workName" data-profile-work-name>
                    {work.name}
                  </span>
                  <span className="pf-workCounts" data-profile-work-counts>
                    {work.views} 次浏览 · {work.likes} 赞 · {work.comments} 评论 · {work.remixes} 改编
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="pf-twin">
        <div className="pf-panel">
          <h2 className="pf-sectionTitle">世界（{profile.worlds.length}）</h2>
          <ul className="pf-list" data-profile-worlds>
            {profile.worlds.map((w) => (
              <li className="pf-listItem" data-profile-world key={w.name}>
                {w.name}
                {w.summary ? <span className="pf-listMeta"> · {w.summary}</span> : null}
                <span className="pf-listMeta"> · 来自《{w.project}》</span>
              </li>
            ))}
            {profile.worlds.length === 0 ? <li className="pf-listEmpty">没有随公开作品放出来的世界。</li> : null}
          </ul>
        </div>
        <div className="pf-panel">
          <h2 className="pf-sectionTitle">角色（{profile.characters.length}）</h2>
          <ul className="pf-list" data-profile-characters>
            {profile.characters.map((c) => (
              <li className="pf-listItem" data-profile-character key={c.name}>
                {c.name}
                {c.summary ? <span className="pf-listMeta"> · {c.summary}</span> : null}
                <span className="pf-listMeta"> · 来自《{c.project}》</span>
              </li>
            ))}
            {profile.characters.length === 0 ? <li className="pf-listEmpty">没有随公开作品放出来的角色。</li> : null}
          </ul>
        </div>
      </section>

      <p className="pf-privacy" data-profile-privacy>
        上面只列出公网上传着的内容：世界文档与角色档案（声音、关系、记忆）在作者的项目里，没有因为有人访问主页就跟着公开。
      </p>

      <section className="pf-section">
        <h2 className="pf-sectionTitle">游戏（{profile.games.count}）</h2>
        {profile.games.entries.length ? (
          <ul className="pf-list" data-profile-games>
            {profile.games.entries.map((g) => (
              <li className="pf-listItem" data-profile-game={g.path} key={g.path}>
                {g.playable ? (
                  <Link href={`${g.path}/play`} className="pf-gamePlay" data-profile-game-play>
                    试玩《{g.name}》
                  </Link>
                ) : (
                  <>
                    {g.name}{' '}
                    <span className="pf-designOnly" data-profile-game-design-only>
                      只有设计稿，没有可玩版本
                    </span>
                  </>
                )}
              </li>
            ))}
          </ul>
        ) : null}
        <p className="pf-gamesNote" data-profile-games-note>
          {profile.games.note}
        </p>
      </section>
    </main>
  );
}
