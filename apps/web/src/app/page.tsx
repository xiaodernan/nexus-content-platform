import { getAiCapabilities } from '@/lib/env';
import { aiServiceUrl, fetchAiServiceHealth } from '@/server/ai/client';
import { requireUser } from '@/server/domain/session';
import { listDeletedProjects, listProjects } from '@/server/domain/projects';
import { NewProjectForm } from '@/components/NewProjectForm';
import { ImportPanel } from '@/components/ImportPanel';
import { AccountPanel } from '@/components/AccountPanel';
import { AccountDeletionPanel } from '@/components/AccountDeletionPanel';
import { ProfileEditor } from '@/components/ProfileEditor';
import { AvatarEditor } from '@/components/AvatarEditor';
import { ProjectDescriptionEditor } from '@/components/ProjectDescriptionEditor';
import { ProjectDeleteCard } from '@/components/ProjectDeleteCard';
import { RestoreProjectButton } from '@/components/RestoreProjectButton';
import { NotificationBell } from '@/components/NotificationBell';
import { accountOf, listSaves } from '@/server/domain/profile';
import { getLocale, type Locale } from '@/lib/i18n';

export const dynamic = 'force-dynamic';

const MODALITIES: Record<Locale, ReadonlyArray<{ key: 'text' | 'image' | 'video'; label: string }>> = {
  zh: [
    { key: 'text', label: '文本 / 设计生成' },
    { key: 'image', label: '图像生成' },
    { key: 'video', label: '视频生成' },
  ],
  en: [
    { key: 'text', label: 'Text / design generation' },
    { key: 'image', label: 'Image generation' },
    { key: 'video', label: 'Video generation' },
  ],
};

const COPY: Record<Locale, {
  navAria: string;
  navSearch: string;
  navDiscover: string;
  navMarket: string;
  navAnalytics: string;
  navBlocked: string;
  navNote: string;
  sectionAccount: string;
  sectionProjects: string;
  emptyProjects: string;
  trashTitle: (n: number) => string;
  trashNote: string;
  removedAt: (date: string) => string;
  trashEmpty: string;
  profileTitle: string;
  profileOnlyPublic: string;
  profileNoHandle: string;
  savedTitle: (n: number) => string;
  savedEmpty: string;
  viewsLikes: (views: number, likes: number, savedAt: string) => string;
  providerTitle: string;
  providerNote: string;
  unconfigured: string;
  unconfiguredLabel: string;
  reachable: (capability: string) => string;
  unreachable: string;
}> = {
  zh: {
    navAria: '站点导航',
    navSearch: '全平台搜索',
    navDiscover: '发现',
    navMarket: '市场',
    navAnalytics: '创作数据',
    navBlocked: '已拉黑与已屏蔽',
    navNote: '公开在跑的作品与全平台的内容搜索；数据与通知只对登录后的你自己可见',
    sectionAccount: '账号',
    sectionProjects: '项目',
    emptyProjects: '还没有项目。创建一个即可进入 Studio 画布。',
    trashTitle: (n) => `回收站（${n}）`,
    trashNote: '删掉的项目不再出现在项目列表、搜索、发现和创作数据里，公开页与分享链接也从那一刻打不开。快照、发布记录与评论都还留着，恢复后回到上面的列表。',
    removedAt: (date) => `删除于 ${date}`,
    trashEmpty: '回收站是空的。删除一个项目需要在上面逐字输入它的名字——这一步由服务端判定，不是界面上的弹窗。',
    profileTitle: '我的主页',
    profileOnlyPublic: '这里只会出现你公开过的作品',
    profileNoHandle: '你还没有可用于主页的地址（handle 在首次发布时生成）。',
    savedTitle: (n) => `我收藏的版本（${n}）`,
    savedEmpty: '还没有收藏。在任意公开作品页点「收藏这一版」，收下的就是那一刻的那一版——作者之后重新发布不会换掉它。',
    viewsLikes: (views, likes, savedAt) => `${views} 浏览 · ${likes} 赞 · 收藏于 ${savedAt}`,
    providerTitle: 'Provider 就绪状态',
    providerNote: '读取自 AI Service 的 /healthz（provider key 只存在于 ai-service 进程，web 不持有）。未配置真实 key 时，生成链路走标注过的确定性 Mock，而不是伪装成功能可用（§159-160）。',
    unconfigured: '未配置 AI 服务地址',
    unconfiguredLabel: '未配置',
    reachable: (capability) => `在线 · ${capability}`,
    unreachable: '不可达',
  },
  en: {
    navAria: 'Site navigation',
    navSearch: 'Search the platform',
    navDiscover: 'Discover',
    navMarket: 'Marketplace',
    navAnalytics: 'Creator data',
    navBlocked: 'Blocked & muted',
    navNote: 'Public works and platform-wide search; your data and notifications are visible only to you, after sign-in',
    sectionAccount: 'Account',
    sectionProjects: 'Projects',
    emptyProjects: 'No projects yet. Create one and you land in the Studio canvas.',
    trashTitle: (n) => `Trash (${n})`,
    trashNote: 'Projects deleted here disappear from the project list, search, discovery and creator data; the public page and share links go dark from that moment. Snapshots, publish records and comments stay — restoring brings everything back above.',
    removedAt: (date) => `Deleted ${date}`,
    trashEmpty: 'The trash is empty. Deleting a project requires typing its name exactly above — a server-side check, not a dialog.',
    profileTitle: 'My profile',
    profileOnlyPublic: 'Only works you published will appear here',
    profileNoHandle: 'No address for your profile yet (a handle is minted on first publish).',
    savedTitle: (n) => `Saved versions (${n})`,
    savedEmpty: 'No saves yet. On any public work page, use “Save this version” — what you keep is that exact version; republishing by the author never swaps it.',
    viewsLikes: (views, likes, savedAt) => `${views} views · ${likes} likes · saved ${savedAt}`,
    providerTitle: 'Provider readiness',
    providerNote: 'Read from the AI Service’s /healthz (the provider key lives in the ai-service process, never in web). Without a real key, generation walks the labeled deterministic mock — it does not pretend to be working (§159-160).',
    unconfigured: 'NEXUS_AI_SERVICE_URL not set',
    unconfiguredLabel: 'Not configured',
    reachable: (capability) => `Online · ${capability}`,
    unreachable: 'Unreachable',
  },
};

export default async function HomePage() {
  const [user, locale] = await Promise.all([requireUser(), getLocale()]);
  const c = COPY[locale];
  const dateLocale = locale === 'zh' ? 'zh-CN' : 'en-US';
  const projects = await listProjects(user.id);
  // §60 / §59：主页信息与"我收藏的那些版本"。都是按当前身份读的，不是全局缓存
  // §74：回收站和上面的项目列表是同一张表的两半（deletedAt 空 / 非空），所以也要一起读
  const [account, saved, deleted] = await Promise.all([
    accountOf(user.id),
    listSaves(user.id, 8),
    listDeletedProjects(user.id),
  ]);
  const serviceUrl = aiServiceUrl();
  const health = serviceUrl ? await fetchAiServiceHealth() : null;
  const caps = await getAiCapabilities(health);
  const serviceState = !serviceUrl ? 'missing' : health ? 'ready' : 'unreachable';
  const serviceLabel = !serviceUrl ? c.unconfiguredLabel : health ? c.reachable(health.capability) : c.unreachable;

  return (
    <main className="hp-page">
      <header className="hp-hero">
        <div>
          <h1 className="hp-heroTitle" data-nexus-wordmark>NEXUS</h1>
          <p className="hp-heroSub">Describe it. Design it. Generate it. Build it. Enter it.</p>
        </div>
        <span
          className={`hp-demoChip ${caps.live ? 'hp-demoChipLive' : 'hp-demoChipDemo'}`}
          data-demo-mode={caps.live ? 'off' : 'on'}
        >
          {caps.live ? 'LIVE PROVIDER' : 'DEMO MODE'}
        </span>
      </header>

      {/* 这一排在 820px 的容器里放不下五个链接加一句说明：不 flex-wrap 就会被 flex 压着
          在词中间断行（"全平台搜/索"），所以链接各自 nowrap、整排允许换行。 */}
      <nav className="hp-nav" data-site-nav aria-label={c.navAria}>
        <a href="/search" className="hp-navlink" data-nav-search>
          {c.navSearch}
        </a>
        <a href="/discover" className="hp-navlink" data-nav-discover>
          {c.navDiscover}
        </a>
        <a href="/marketplace" className="hp-navlink" data-nav-marketplace>
          {c.navMarket}
        </a>
        <a href="/analytics" className="hp-navlink" data-nav-analytics>
          {c.navAnalytics}
        </a>
        <a href="/blocks" className="hp-navlink" data-nav-blocks>
          {c.navBlocked}
        </a>
        <NotificationBell locale={locale} />
        <span className="hp-navNote">{c.navNote}</span>
      </nav>

      <section className="hp-section">
        <h2 className="hp-sectionTitle">{c.sectionAccount}</h2>
        <AccountPanel user={user} locale={locale} />
        {/* §144 / ADR-0025：注销入口对游客与登录用户都开——游客那条也是 users 表里一行真记录，
            能登进来就能注销出去，没有理由只给注册过的账号留出口 */}
        <div className="hp-sectionGap">
          <AccountDeletionPanel locale={locale} />
        </div>
      </section>

      <section className="hp-section">
        <h2 className="hp-sectionTitle">{c.sectionProjects}</h2>
        <NewProjectForm locale={locale} />
        <ImportPanel locale={locale} />
        {projects.length ? (
          <ul className="hp-listLoose">
            {projects.map((project) => (
              <li key={project.id} className="hp-listItem">
                <a
                  href={`/studio/${project.id}`}
                  className="hp-rowCardInteractive"
                  data-project-row={project.id}
                >
                  <span className="hp-rowName">{project.name}</span>
                  <span className="hp-rowMeta">
                    {project.kind} · {new Date(project.updatedAt).toLocaleString(dateLocale, { hour12: false })}
                  </span>
                </a>
                <div className="hp-rowInset">
                  <ProjectDescriptionEditor projectId={project.id} initialDescription={project.description} locale={locale} />
                </div>
                <div className="hp-rowInset">
                  <ProjectDeleteCard projectId={project.id} projectName={project.name} locale={locale} />
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <div className="hp-emptySection">
            <p>{c.emptyProjects}</p>
          </div>
        )}
      </section>

      <section className="hp-section">
        <h2 className="hp-sectionTitleTight">{c.trashTitle(deleted.length)}</h2>
        <p className="hp-sectionNote">{c.trashNote}</p>
        {deleted.length ? (
          <ul className="hp-list" data-deleted-list>
            {deleted.map((item) => (
              <li
                key={item.id}
                className="hp-rowCardStatic"
                data-deleted-row={item.id}
              >
                <span className="hp-rowNameMuted">
                  {item.name}
                  <span className="hp-rowMeta">
                    {item.kind} · {c.removedAt(new Date(item.deletedAt).toLocaleString(dateLocale, { hour12: false }))}
                  </span>
                </span>
                <RestoreProjectButton projectId={item.id} projectName={item.name} locale={locale} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="hp-emptyNote" data-deleted-empty>
            {c.trashEmpty}
          </p>
        )}
      </section>

      <section className="hp-section">
        <h2 className="hp-sectionTitle">{c.profileTitle}</h2>
        {account.handle ? (
          <p className="hp-profileLede">
            <a href={`/u/${account.handle}`} className="hp-profileLink" data-my-profile-link>
              /u/{account.handle}
            </a>
            <span className="hp-inlineNote">{c.profileOnlyPublic}</span>
          </p>
        ) : (
          <p className="hp-profileLedeMuted" data-my-profile-link="none">
            {c.profileNoHandle}
          </p>
        )}
        <AvatarEditor initialUrl={account.avatarUrl} locale={locale} />
        <div className="hp-sectionGap">
          <ProfileEditor initialBio={account.bio} locale={locale} />
        </div>

        <h3 className="hp-subTitle">
          {c.savedTitle(saved.length)}
        </h3>
        {saved.length ? (
          <ul className="hp-list" data-saved-list>
            {saved.map((card) => (
              <li key={card.publicationId} data-saved-row={card.publicationId}>
                {card.unavailableReason ? (
                  <span className="hp-rowCardMuted">
                    <span>{card.name}</span>
                    <span className="hp-monoReason">{card.unavailableReason}</span>
                  </span>
                ) : (
                  <a
                    href={card.path}
                    className="hp-rowCardInteractive"
                  >
                    <span className="hp-rowName">
                      {card.name}
                      <span className="hp-byline">by {card.owner}</span>
                    </span>
                    <span className="hp-rowMeta">
                      {c.viewsLikes(card.views, card.likes, new Date(card.savedAt).toLocaleDateString(dateLocale))}
                    </span>
                  </a>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="hp-emptyNote" data-saved-empty>
            {c.savedEmpty}
          </p>
        )}
      </section>

      <section className="hp-section">
        <h2 className="hp-sectionTitle">{c.providerTitle}</h2>
        <p className="hp-sectionNoteLoose">{c.providerNote}</p>
        <ul className="hp-list">
          {MODALITIES[locale].map((m) => (
            <li key={m.key} className="hp-rowCard">
              <span className="hp-rowName">{m.label}</span>
              <span className="hp-statusBadge">{caps[m.key]}</span>
            </li>
          ))}
          <li className="hp-rowCard" data-ai-service={serviceState}>
            <span className="hp-rowName">
              AI Service
              <span className="hp-rowMetaIndent">{serviceUrl ?? c.unconfigured}</span>
            </span>
            <span className="hp-statusBadge">{serviceLabel}</span>
          </li>
        </ul>
        {health ? (
          <ul className="hp-healthList">
            {health.providers.map((p) => (
              <li key={`${p.kind}:${p.name}`} className="hp-healthRow">
                <span className="hp-healthKind">{p.kind} · {p.name}{p.models.length ? ` · ${p.models.join('/')}` : ''}</span>
                <span className="hp-healthStatus" title={p.reason}>{p.status}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </section>
    </main>
  );
}
