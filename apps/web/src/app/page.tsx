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

const MODALITIES = [{ key: 'text' }, { key: 'image' }, { key: 'video' }] as const;

/** 双语：主页（登录后首页）的每行文案按 cookie locale 选一份——中文模式全中文，英文模式全英文 */
const HOME_TXT = {
  zh: {
    modalityText: '文本 / 设计生成',
    modalityImage: '图像生成',
    modalityVideo: '视频生成',
    ariaNav: '站点导航',
    navSearch: '全平台搜索',
    navDiscover: '发现',
    navMarket: '市场',
    navAnalytics: '创作数据',
    navBlocks: '已拉黑与已屏蔽',
    navNote: '公开在跑的作品与全平台的内容搜索；数据与通知只对登录后的你自己可见',
    helpKicker: '第一次来？',
    helpText:
      '先花两分钟走一遍 6 步上手漫游，再打开随手可用的简明说明书；Ctrl+K（Mac 用 ⌘K）随时调出命令面板，直奔任何页面。',
    helpOnboarding: '上手漫游 · 6 步',
    helpGuide: '简明说明书',
    hintSearch: '全站作品、作者与内容关键词',
    hintDiscover: '公开跑着的作品 · 按热度/最新',
    hintMarket: '组件 / 模板 / 世界观 / 资产市场',
    hintAnalytics: '你自己的创作节奏与漏斗',
    hintBlocks: '你拉黑的作者与关键词',
    navSearchTitle: '全平台搜索引擎：搜公开作品与创作者',
    navDiscoverTitle: '发现页：全平台公开作品流，按新鲜度与相关度',
    navMarketTitle: '市场：公开上架的组件、页面、游戏项目与素材',
    navAnalyticsTitle: '创作数据：你的作品浏览、通关、关注与趋势预测',
    navBlocksTitle: '已拉黑与已屏蔽：这里集中管理屏蔽名单',
    quickStartAria: '主界面操作速览',
    quickStartKicker: '快速上手',
    quickStartSteps: [
      { title: '造项目', body: '在「新建作品」里一句话或一张图讲清楚想做什么，服务端会把上下文装配好，Studio 直接开画布' },
      { title: '推成品', body: '在画布里 @Agent 或点「让模型读一眼」，改完点发布；审批、版权记录、版本收藏都在账上' },
      { title: '看见数据', body: '浏览、通关、收藏与趋势预测在「创作数据」和「观察坞」；口令 123，所有人都能看聚合' },
    ],
    quickStartGuide: '阅读简明说明书 →',
    quickStartOnboarding: '新手教程 / 快速上手演示 →',
    quickStartOracle: '问潮 · 潮汐预言 →',
    accountSection: '账号',
    projectsSection: '项目',
    emptyProjects: '还没有项目。创建一个即可进入 Studio 画布。',
    trashSection: (n: number) => `回收站（${n}）`,
    trashNote:
      '删掉的项目不再出现在项目列表、搜索、发现和创作数据里，公开页与分享链接也从那一刻打不开。快照、发布记录与评论都还留着，恢复后回到上面的列表。',
    deletedAt: (d: string) => `删除于 ${d}`,
    trashEmpty: '回收站是空的。删除一个项目需要在上面逐字输入它的名字——这一步由服务端判定，不是界面上的弹窗。',
    myHome: '我的主页',
    handleNote: '这里只会出现你公开过的作品',
    handleMissing: '你还没有可用于主页的地址（handle 在首次发布时生成）。',
    savedTitle: (n: number) => `我收藏的版本（${n}）`,
    savedMeta: (views: number, likes: number, d: string) => `${views} 浏览 · ${likes} 赞 · 收藏于 ${d}`,
    savedEmpty: '还没有收藏。在任意公开作品页点「收藏这一版」，收下的就是那一刻的那一版——作者之后重新发布不会换掉它。',
    providerReady: 'Provider 就绪状态',
    providerNote:
      '读取自 AI Service 的 /healthz（provider key 只存在于 ai-service 进程，web 不持有）。未配置真实 key 时，生成链路走标注过的确定性 Mock，而不是伪装成功能可用（§159-160）。',
    serviceNotConfigured: '未配置',
    serviceOnline: (cap: string) => `在线 · ${cap}`,
    serviceUnreachable: '不可达',
    serviceMissingUrl: '未配置 NEXUS_AI_SERVICE_URL',
  },
  en: {
    modalityText: 'Text / design generation',
    modalityImage: 'Image generation',
    modalityVideo: 'Video generation',
    ariaNav: 'Site navigation',
    navSearch: 'Platform search',
    navDiscover: 'Discover',
    navMarket: 'Marketplace',
    navAnalytics: 'Creative data',
    navBlocks: 'Blocked & muted',
    navNote: 'Works publicly on the platform and platform-wide search; your data and notifications are visible only to you, signed in.',
    helpKicker: 'First time here?',
    helpText:
      'Take the 6-step onboarding first, then keep the in-app guide handy; press Ctrl+K (⌘K on Mac) to pull up the command palette anywhere.',
    helpOnboarding: 'Onboarding — 6 steps',
    helpGuide: 'In-app guide',
    hintSearch: 'Works, authors, keywords across the platform',
    hintDiscover: 'Public works in motion — trending or fresh',
    hintMarket: 'Components, templates, worlds, assets',
    hintAnalytics: 'Your own creative funnel & rhythm',
    hintBlocks: 'Authors & keywords you blocked',
    navSearchTitle: 'Platform search: find public works and creators',
    navDiscoverTitle: 'Discover: public works across the platform, by freshness and relevance',
    navMarketTitle: 'Marketplace: public components, pages, game projects and assets',
    navAnalyticsTitle: 'Creative data: views, clears, follows and forecasts for your works',
    navBlocksTitle: 'Blocked & muted: manage your block list in one place',
    quickStartAria: 'Quick tour of this home screen',
    quickStartKicker: 'QUICK START',
    quickStartSteps: [
      { title: 'Start a project', body: 'Describe it in words or with an image in “New project” — the server assembles the context and Studio opens the canvas' },
      { title: 'Ship it', body: '@the agent or ask the model to look, edit, publish; approvals, attribution and saved versions all land in the ledger' },
      { title: 'See the data', body: 'Views, clears, saves and forecasts live in “Creative data” and the “Observatory” — passphrase 123, aggregates for everyone' },
    ],
    quickStartGuide: 'Read the quick manual →',
    quickStartOnboarding: 'Beginner tutorial / quick demo →',
    quickStartOracle: 'Ask the tide · The Tide Oracle →',
    accountSection: 'Account',
    projectsSection: 'Projects',
    emptyProjects: 'No projects yet. Create one to step into the Studio canvas.',
    trashSection: (n: number) => `Trash (${n})`,
    trashNote:
      'Deleted projects no longer appear in the list, search, discover or creative data, and their public pages and share links stop opening from that moment. Snapshots, publish history and comments are kept; restoring brings an item back to the list above.',
    deletedAt: (d: string) => `deleted ${d}`,
    trashEmpty: 'The trash is empty. Deleting a project requires typing its exact name above — that check is enforced server-side, not by a dialog in the UI.',
    myHome: 'My home page',
    handleNote: 'Only the works you published appear here.',
    handleMissing: 'You do not have a profile address yet (the handle is generated on your first publish).',
    savedTitle: (n: number) => `Saved versions (${n})`,
    savedMeta: (views: number, likes: number, d: string) => `${views} views · ${likes} likes · saved ${d}`,
    savedEmpty: 'Nothing saved yet. On any public work page, click "Save this version" — what you take is that exact release; later republications by the author do not replace it.',
    providerReady: 'Provider readiness',
    providerNote:
      'Read from the AI Service /healthz (the provider key lives only in the ai-service process; web never holds it). Until a real key is configured, generation runs through a labelled deterministic Mock instead of pretending to work (§159-160).',
    serviceNotConfigured: 'Not configured',
    serviceOnline: (cap: string) => `Online · ${cap}`,
    serviceUnreachable: 'Unreachable',
    serviceMissingUrl: 'NEXUS_AI_SERVICE_URL not configured',
  },
} as const;
const modalityLabel = (T: (typeof HOME_TXT)[Locale], key: (typeof MODALITIES)[number]['key']) =>
  key === 'text' ? T.modalityText : key === 'image' ? T.modalityImage : T.modalityVideo;

export default async function HomePage() {
  const user = await requireUser();
  const locale = await getLocale();
  const T = HOME_TXT[locale];
  const intlLocale = locale === 'en' ? 'en-US' : 'zh-CN';
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
  const serviceLabel = !serviceUrl
    ? T.serviceNotConfigured
    : health ? T.serviceOnline(health.capability) : T.serviceUnreachable;

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

      {/* 教学说明条（§五/§七）：首次来访的人不用翻文档——漫游 + 说明书 + 命令面板，三件套带路 */}
      <p className="hp-helpStrip" data-help-strip>
        <span className="hp-helpKicker">{T.helpKicker}</span>
        <span className="hp-helpText">{T.helpText}</span>
        <a href="/onboarding" className="hp-helpLink" data-help-onboarding>{T.helpOnboarding}</a>
        <a href="/guide" className="hp-helpLink" data-help-guide>{T.helpGuide}</a>
      </p>

      {/* 这一排在 820px 的容器里放不下五个链接加一句说明：不 flex-wrap 就会被 flex 压着
          在词中间断行（"全平台搜/索"），所以链接各自 nowrap、整排允许换行。 */}
      <nav className="hp-nav" data-site-nav aria-label={T.ariaNav}>
        <span className="hp-navitem">
          <a href="/search" className="hp-navlink" data-nav-search title={T.navSearchTitle}>
            {T.navSearch}
          </a>
          <span className="hp-navHint">{T.hintSearch}</span>
        </span>
        <span className="hp-navitem">
          <a href="/discover" className="hp-navlink" data-nav-discover title={T.navDiscoverTitle}>
            {T.navDiscover}
          </a>
          <span className="hp-navHint">{T.hintDiscover}</span>
        </span>
        <span className="hp-navitem">
          <a href="/marketplace" className="hp-navlink" data-nav-marketplace title={T.navMarketTitle}>
            {T.navMarket}
          </a>
          <span className="hp-navHint">{T.hintMarket}</span>
        </span>
        <span className="hp-navitem">
          <a href="/analytics" className="hp-navlink" data-nav-analytics title={T.navAnalyticsTitle}>
            {T.navAnalytics}
          </a>
          <span className="hp-navHint">{T.hintAnalytics}</span>
        </span>
        <span className="hp-navitem">
          <a href="/blocks" className="hp-navlink" data-nav-blocks title={T.navBlocksTitle}>
            {T.navBlocks}
          </a>
          <span className="hp-navHint">{T.hintBlocks}</span>
        </span>
        <NotificationBell locale={locale} />
        <span className="hp-navNote">{T.navNote}</span>
      </nav>

      <aside className="hp-quickStart" aria-label={T.quickStartAria} data-home-quickstart>
        <p className="hp-quickStartKicker">{T.quickStartKicker}</p>
        <ol className="hp-quickStartSteps">
          {T.quickStartSteps.map((step, i) => (
            <li key={i} className="hp-quickStartStep" data-home-quickstart-step={i + 1}>
              <span className="hp-quickStartNum" aria-hidden="true">{String(i + 1).padStart(2, '0')}</span>
              <p className="hp-quickStartText"><strong>{step.title}</strong> — {step.body}</p>
            </li>
          ))}
        </ol>
        <div className="hp-quickStartFoot">
          <a className="hp-quickStartLink" href="/guide">{T.quickStartGuide}</a>
          <a className="hp-quickStartLink" href="/onboarding">{T.quickStartOnboarding}</a>
          <a className="hp-quickStartLink" href="/tide-oracle" data-home-quickstart-oracle>{T.quickStartOracle}</a>
        </div>
      </aside>

      <section className="hp-section">
        <h2 className="hp-sectionTitle">{T.accountSection}</h2>
        <AccountPanel user={user} locale={locale} />
        {/* §144 / ADR-0025：注销入口对游客与登录用户都开——游客那条也是 users 表里一行真记录，
            能登进来就能注销出去，没有理由只给注册过的账号留出口 */}
        <div className="hp-sectionGap">
          <AccountDeletionPanel locale={locale} />
        </div>
      </section>

      <section className="hp-section">
        <h2 className="hp-sectionTitle">{T.projectsSection}</h2>
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
                    {project.kind} · {new Date(project.updatedAt).toLocaleString(intlLocale, { hour12: false })}
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
            <p>{T.emptyProjects}</p>
          </div>
        )}
      </section>

      <section className="hp-section">
        <h2 className="hp-sectionTitleTight">{T.trashSection(deleted.length)}</h2>
        <p className="hp-sectionNote">
          {T.trashNote}
        </p>
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
                    {item.kind} · {T.deletedAt(new Date(item.deletedAt).toLocaleString(intlLocale, { hour12: false }))}
                  </span>
                </span>
                <RestoreProjectButton projectId={item.id} projectName={item.name} locale={locale} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="hp-emptyNote" data-deleted-empty>
            {T.trashEmpty}
          </p>
        )}
      </section>

      <section className="hp-section">
        <h2 className="hp-sectionTitle">{T.myHome}</h2>
        {account.handle ? (
          <p className="hp-profileLede">
            <a href={`/u/${account.handle}`} className="hp-profileLink" data-my-profile-link>
              /u/{account.handle}
            </a>
            <span className="hp-inlineNote">{T.handleNote}</span>
          </p>
        ) : (
          <p className="hp-profileLedeMuted" data-my-profile-link="none">
            {T.handleMissing}
          </p>
        )}
        <AvatarEditor initialUrl={account.avatarUrl} locale={locale} />
        <div className="hp-sectionGap">
          <ProfileEditor initialBio={account.bio} locale={locale} />
        </div>

        <h3 className="hp-subTitle">
          {T.savedTitle(saved.length)}
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
                      {T.savedMeta(card.views, card.likes, new Date(card.savedAt).toLocaleDateString(intlLocale))}
                    </span>
                  </a>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="hp-emptyNote" data-saved-empty>
            {T.savedEmpty}
          </p>
        )}
      </section>

      <section className="hp-section">
        <h2 className="hp-sectionTitle">{T.providerReady}</h2>
        <p className="hp-sectionNoteLoose">
          {T.providerNote}
        </p>
        <ul className="hp-list">
          {MODALITIES.map((m) => (
            <li key={m.key} className="hp-rowCard">
              <span className="hp-rowName">{modalityLabel(T, m.key)}</span>
              <span className="hp-statusBadge">{caps[m.key]}</span>
            </li>
          ))}
          <li className="hp-rowCard" data-ai-service={serviceState}>
            <span className="hp-rowName">
              AI Service
              <span className="hp-rowMetaIndent">{serviceUrl ?? T.serviceMissingUrl}</span>
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
