import Link from 'next/link';
import { notFound } from 'next/navigation';
import { profileOf } from '@/server/domain/profile';
import { currentUserOrNull } from '@/server/domain/session';
import { FollowButton } from './FollowButton';
import { BlockControl } from './BlockControl';
import { getLocale, type Locale } from '@/lib/i18n';

export const dynamic = 'force-dynamic';

/**
 * 双语 COPY（2026-11-15 公开试玩面 wave）：账号名/bio 是内容，原文渲染；
 * 页内的说明句与标签一律两套对齐，组件只做选择。
 */
const COPY: Record<Locale, {
  deletedBanner: string;
  bioEmpty: string;
  deletedAvatarTitle: string;
  followersCount: (f: number, t: number) => string;
  selfProfile: string;
  publicWorksHead: (n: number) => string;
  noPublicWorks: string;
  view: string;
  like: string;
  comment: string;
  remix: string;
  worldsHead: (n: number) => string;
  worldsEmpty: string;
  charactersHead: (n: number) => string;
  charactersEmpty: string;
  fromProject: (project: string) => string;
  gamesHead: (n: number) => string;
  gameDesignOnly: string;
  tryPlayOf: (name: string) => string;
  privacyNote: string;
}> = {
  zh: {
    deletedBanner: '这个账号已经注销：作者名与个人简介不再显示，下面列出的作品仍在公网上传着、可以正常访问与阅读。',
    bioEmpty: '这位作者还没写简介。',
    deletedAvatarTitle: '账号已注销',
    followersCount: (f, t) => `${f} 位粉丝 · 关注 ${t} 人`,
    selfProfile: '这是你自己的主页',
    publicWorksHead: (n) => `公开作品（${n}）`,
    noPublicWorks: '还没有公开的作品。',
    view: '次浏览',
    like: '赞',
    comment: '评论',
    remix: '改编',
    worldsHead: (n) => `世界（${n}）`,
    worldsEmpty: '没有随公开作品放出来的世界。',
    charactersHead: (n) => `角色（${n}）`,
    charactersEmpty: '没有随公开作品放出来的角色。',
    fromProject: (project) => `来自《${project}》`,
    gamesHead: (n) => `游戏（${n}）`,
    gameDesignOnly: '只有设计稿，没有可玩版本',
    tryPlayOf: (name) => `试玩《${name}》`,
    privacyNote:
      '上面只列出公网上传着的内容：世界文档与角色档案（声音、关系、记忆）在作者的项目里，没有因为有人访问主页就跟着公开。',
  },
  en: {
    deletedBanner: 'This account is deleted: the author name and bio are no longer shown. The public works below remain online and readable.',
    bioEmpty: 'This author hasn’t written a bio yet.',
    deletedAvatarTitle: 'Account deleted',
    followersCount: (f, t) => `${f} followers · following ${t}`,
    selfProfile: 'This is your own page',
    publicWorksHead: (n) => `Public works (${n})`,
    noPublicWorks: 'No public works yet.',
    view: 'views',
    like: 'likes',
    comment: 'comments',
    remix: 'remixes',
    worldsHead: (n) => `Worlds (${n})`,
    worldsEmpty: 'No worlds published with public works yet.',
    charactersHead: (n) => `Characters (${n})`,
    charactersEmpty: 'No characters published with public works yet.',
    fromProject: (project) => `from “${project}”`,
    gamesHead: (n) => `Games (${n})`,
    gameDesignOnly: 'design only (no playable version)',
    tryPlayOf: (name) => `Play “${name}”`,
    privacyNote:
      'Only public items are listed above: world documents and character sheets (voice, relationships, memories) live in the author’s project — they don’t get published just because someone opens this page.',
  },
};

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
  const locale = await getLocale();
  const c = COPY[locale];
  const viewer = await currentUserOrNull();
  const profile = await profileOf(decodeURIComponent(handle), viewer?.id ?? null);
  if (!profile) notFound();

  return (
    <main className="pf-root pf-pageRoot" data-profile-root>
      {/* §144 / ADR-0025：注销是"关上门"，不是"拆掉房子"——页面还开着，作品还在公网，
          但这一栏必须说清这个人已经不在了，否则读者会以为名字还能联系到本人 */}
      {profile.accountDeleted ? (
        <p
          className="pf-deleted"
          data-profile-deleted-banner
        >
          {c.deletedBanner}
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
              {profile.bio ?? c.bioEmpty}
            </p>
          )}
        </div>
        <div className="pf-actions">
          <span className="pf-counts" data-profile-counts>
            {c.followersCount(profile.followers, profile.following)}
          </span>
          {profile.isSelf ? (
            <span className="pf-selfNote">{c.selfProfile}</span>
          ) : (
            <>
              {/* §132：拉黑之后连"关注"这个按钮都不该还在——它只会回一句拒绝。
                  §144：账号注销之后同理，那个人不会再看到这条关注，也不会有人来接它 */}
              {profile.blockedByViewer === 'block' || profile.accountDeleted ? null : (
                <FollowButton
                  handle={profile.handle}
                  initialFollowing={profile.followingByViewer}
                  initialFollowers={profile.followers}
                  locale={locale}
                />
              )}
              <BlockControl handle={profile.handle} initial={profile.blockedByViewer} locale={locale} />
            </>
          )}
        </div>
      </header>

      <section className="pf-section">
        <h2 className="pf-sectionTitle">{c.publicWorksHead(profile.works.length)}</h2>
        {profile.works.length === 0 ? (
          <p className="pf-empty" data-profile-empty="works">
            {c.noPublicWorks}
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
                    {work.views} {c.view} · {work.likes} {c.like} · {work.comments} {c.comment} · {work.remixes} {c.remix}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="pf-twin">
        <div className="pf-panel">
          <h2 className="pf-sectionTitle">{c.worldsHead(profile.worlds.length)}</h2>
          <ul className="pf-list" data-profile-worlds>
            {profile.worlds.map((w) => (
              <li className="pf-listItem" data-profile-world key={w.name}>
                {w.name}
                {w.summary ? <span className="pf-listMeta"> · {w.summary}</span> : null}
                <span className="pf-listMeta"> · {c.fromProject(w.project)}</span>
              </li>
            ))}
            {profile.worlds.length === 0 ? <li className="pf-listEmpty">{c.worldsEmpty}</li> : null}
          </ul>
        </div>
        <div className="pf-panel">
          <h2 className="pf-sectionTitle">{c.charactersHead(profile.characters.length)}</h2>
          <ul className="pf-list" data-profile-characters>
            {profile.characters.map((ch) => (
              <li className="pf-listItem" data-profile-character key={ch.name}>
                {ch.name}
                {ch.summary ? <span className="pf-listMeta"> · {ch.summary}</span> : null}
                <span className="pf-listMeta"> · {c.fromProject(ch.project)}</span>
              </li>
            ))}
            {profile.characters.length === 0 ? <li className="pf-listEmpty">{c.charactersEmpty}</li> : null}
          </ul>
        </div>
      </section>

      <p className="pf-privacy" data-profile-privacy>
        {c.privacyNote}
      </p>

      <section className="pf-section">
        <h2 className="pf-sectionTitle">{c.gamesHead(profile.games.count)}</h2>
        {profile.games.entries.length ? (
          <ul className="pf-list" data-profile-games>
            {profile.games.entries.map((g) => (
              <li className="pf-listItem" data-profile-game={g.path} key={g.path}>
                {g.playable ? (
                  <Link href={`${g.path}/play`} className="pf-gamePlay" data-profile-game-play>
                    {c.tryPlayOf(g.name)}
                  </Link>
                ) : (
                  <>
                    {g.name}{' '}
                    <span className="pf-designOnly" data-profile-game-design-only>
                      {c.gameDesignOnly}
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
