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
 * 游戏那一栏只有一个计数和一句说明：设计文档（§54）已经有了，可玩构建（§50/§53）还没有，
 * 所以这里不列"游戏卡片"——没有可展示的东西就明说，比省掉一栏诚实。
 */
export default async function ProfilePage({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params;
  const viewer = await currentUserOrNull();
  const profile = await profileOf(decodeURIComponent(handle), viewer?.id ?? null);
  if (!profile) notFound();

  return (
    <main className="mx-auto flex max-w-[980px] flex-col gap-[var(--nexus-space-6)] px-6 py-10" data-profile-root>
      {/* §144 / ADR-0025：注销是"关上门"，不是"拆掉房子"——页面还开着，作品还在公网，
          但这一栏必须说清这个人已经不在了，否则读者会以为名字还能联系到本人 */}
      {profile.accountDeleted ? (
        <p
          className="rounded border border-[var(--nexus-color-border-subtle)] bg-bg-1 px-3 py-2 text-12 text-fg-2"
          data-profile-deleted-banner
        >
          这个账号已经注销：作者名与个人简介不再显示，下面列出的作品仍在公网上传着、可以正常访问与阅读。
        </p>
      ) : null}
      <header className="flex flex-wrap items-start gap-4" data-profile-header>
        {/* 头像：没有就是首字母，不放占位图（§159 不画假内容）；注销的账号连首字母也没有，因为那是本人的名字 */}
        {profile.avatarUrl ? (
          <img src={profile.avatarUrl} alt="" className="h-12 w-12 rounded-full bg-bg-2 object-cover" data-profile-avatar="url" />
        ) : profile.accountDeleted ? null : (
          <span
            className="flex h-12 w-12 items-center justify-center rounded-full bg-bg-2 font-mono text-16 text-fg-1"
            data-profile-avatar="initial"
          >
            {profile.name.slice(0, 1).toUpperCase()}
          </span>
        )}
        <div className="min-w-[16rem] flex-1">
          <h1 className="text-[var(--nexus-font-size-21)] font-semibold" data-profile-name>
            {profile.name}
          </h1>
          <p className="text-11 text-fg-3">@{profile.handle}</p>
          {profile.accountDeleted ? null : (
            <p className="mt-2 text-13 text-fg-2" data-profile-bio>
              {profile.bio ?? '这位作者还没写简介。'}
            </p>
          )}
        </div>
        <div className="flex flex-col items-end gap-2">
          <span className="text-11 text-fg-3" data-profile-counts>
            {profile.followers} 位粉丝 · 关注 {profile.following} 人
          </span>
          {profile.isSelf ? (
            <span className="text-11 text-fg-3">这是你自己的主页</span>
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

      <section>
        <h2 className="text-13 font-semibold text-fg-1">公开作品（{profile.works.length}）</h2>
        {profile.works.length === 0 ? (
          <p className="mt-1 text-12 text-fg-3" data-profile-empty="works">
            还没有公开的作品。
          </p>
        ) : (
          <ul className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2" data-profile-works>
            {profile.works.map((work) => (
              <li key={work.publicationId}>
                <Link href={work.path} className="flex flex-col gap-1 rounded border border-[var(--nexus-color-border-subtle)] bg-bg-1 p-3">
                  <span className="text-13 text-fg-1" data-profile-work-name>
                    {work.name}
                  </span>
                  <span className="text-11 text-fg-3" data-profile-work-counts>
                    {work.views} 次浏览 · {work.likes} 赞 · {work.comments} 评论 · {work.remixes} 改编
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <h2 className="text-13 font-semibold text-fg-1">世界（{profile.worlds.length}）</h2>
          <ul className="mt-1 flex flex-col gap-1" data-profile-worlds>
            {profile.worlds.map((w) => (
              <li className="text-12 text-fg-2" data-profile-world key={w.name}>
                {w.name}
                {w.summary ? <span className="text-fg-3"> · {w.summary}</span> : null}
                <span className="text-fg-3"> · 来自《{w.project}》</span>
              </li>
            ))}
            {profile.worlds.length === 0 ? <li className="text-11 text-fg-3">没有随公开作品放出来的世界。</li> : null}
          </ul>
        </div>
        <div>
          <h2 className="text-13 font-semibold text-fg-1">角色（{profile.characters.length}）</h2>
          <ul className="mt-1 flex flex-col gap-1" data-profile-characters>
            {profile.characters.map((c) => (
              <li className="text-12 text-fg-2" data-profile-character key={c.name}>
                {c.name}
                {c.summary ? <span className="text-fg-3"> · {c.summary}</span> : null}
                <span className="text-fg-3"> · 来自《{c.project}》</span>
              </li>
            ))}
            {profile.characters.length === 0 ? <li className="text-11 text-fg-3">没有随公开作品放出来的角色。</li> : null}
          </ul>
        </div>
      </section>

      <p className="text-11 text-fg-3" data-profile-privacy>
        上面只列出公网上传着的内容：世界文档与角色档案（声音、关系、记忆）在作者的项目里，没有因为有人访问主页就跟着公开。
      </p>

      <section>
        <h2 className="text-13 font-semibold text-fg-1">游戏（{profile.games.count}）</h2>
        <p className="mt-1 text-11 text-fg-3" data-profile-games-note>
          {profile.games.note}
        </p>
      </section>
    </main>
  );
}
