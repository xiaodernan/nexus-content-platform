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

export const dynamic = 'force-dynamic';

const MODALITIES = [
  { key: 'text', label: '文本 / 设计生成' },
  { key: 'image', label: '图像生成' },
  { key: 'video', label: '视频生成' },
] as const;

export default async function HomePage() {
  const user = await requireUser();
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
  const serviceLabel = !serviceUrl ? '未配置' : health ? `在线 · ${health.capability}` : '不可达';

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
      <nav className="hp-nav" data-site-nav aria-label="站点导航">
        <a href="/search" className="hp-navlink" data-nav-search>
          全平台搜索
        </a>
        <a href="/discover" className="hp-navlink" data-nav-discover>
          发现
        </a>
        <a href="/marketplace" className="hp-navlink" data-nav-marketplace>
          市场
        </a>
        <a href="/analytics" className="hp-navlink" data-nav-analytics>
          创作数据
        </a>
        <a href="/blocks" className="hp-navlink" data-nav-blocks>
          已拉黑与已屏蔽
        </a>
        <NotificationBell />
        <span className="hp-navNote">公开在跑的作品与全平台的内容搜索；数据与通知只对登录后的你自己可见</span>
      </nav>

      <section className="hp-section">
        <h2 className="hp-sectionTitle">账号</h2>
        <AccountPanel user={user} />
        {/* §144 / ADR-0025：注销入口对游客与登录用户都开——游客那条也是 users 表里一行真记录，
            能登进来就能注销出去，没有理由只给注册过的账号留出口 */}
        <div className="hp-sectionGap">
          <AccountDeletionPanel />
        </div>
      </section>

      <section className="hp-section">
        <h2 className="hp-sectionTitle">项目</h2>
        <NewProjectForm />
        <ImportPanel />
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
                    {project.kind} · {new Date(project.updatedAt).toLocaleString('zh-CN', { hour12: false })}
                  </span>
                </a>
                <div className="hp-rowInset">
                  <ProjectDescriptionEditor projectId={project.id} initialDescription={project.description} />
                </div>
                <div className="hp-rowInset">
                  <ProjectDeleteCard projectId={project.id} projectName={project.name} />
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <div className="hp-emptySection">
            <p>还没有项目。创建一个即可进入 Studio 画布。</p>
          </div>
        )}
      </section>

      <section className="hp-section">
        <h2 className="hp-sectionTitleTight">回收站（{deleted.length}）</h2>
        <p className="hp-sectionNote">
          删掉的项目不再出现在项目列表、搜索、发现和创作数据里，公开页与分享链接也从那一刻打不开。
          快照、发布记录与评论都还留着，恢复后回到上面的列表。
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
                    {item.kind} · 删除于 {new Date(item.deletedAt).toLocaleString('zh-CN', { hour12: false })}
                  </span>
                </span>
                <RestoreProjectButton projectId={item.id} projectName={item.name} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="hp-emptyNote" data-deleted-empty>
            回收站是空的。删除一个项目需要在上面逐字输入它的名字——这一步由服务端判定，不是界面上的弹窗。
          </p>
        )}
      </section>

      <section className="hp-section">
        <h2 className="hp-sectionTitle">我的主页</h2>
        {account.handle ? (
          <p className="hp-profileLede">
            <a href={`/u/${account.handle}`} className="hp-profileLink" data-my-profile-link>
              /u/{account.handle}
            </a>
            <span className="hp-inlineNote">这里只会出现你公开过的作品</span>
          </p>
        ) : (
          <p className="hp-profileLedeMuted" data-my-profile-link="none">
            你还没有可用于主页的地址（handle 在首次发布时生成）。
          </p>
        )}
        <AvatarEditor initialUrl={account.avatarUrl} />
        <div className="hp-sectionGap">
          <ProfileEditor initialBio={account.bio} />
        </div>

        <h3 className="hp-subTitle">
          我收藏的版本（{saved.length}）
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
                      {card.views} 浏览 · {card.likes} 赞 · 收藏于 {new Date(card.savedAt).toLocaleDateString('zh-CN')}
                    </span>
                  </a>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="hp-emptyNote" data-saved-empty>
            还没有收藏。在任意公开作品页点「收藏这一版」，收下的就是那一刻的那一版——作者之后重新发布不会换掉它。
          </p>
        )}
      </section>

      <section className="hp-section">
        <h2 className="hp-sectionTitle">Provider 就绪状态</h2>
        <p className="hp-sectionNoteLoose">
          读取自 AI Service 的 /healthz（provider key 只存在于 ai-service 进程，web 不持有）。未配置真实 key 时，生成链路走标注过的确定性 Mock，而不是伪装成功能可用（§159-160）。
        </p>
        <ul className="hp-list">
          {MODALITIES.map((m) => (
            <li key={m.key} className="hp-rowCard">
              <span className="hp-rowName">{m.label}</span>
              <span className="hp-statusBadge">{caps[m.key]}</span>
            </li>
          ))}
          <li className="hp-rowCard" data-ai-service={serviceState}>
            <span className="hp-rowName">
              AI Service
              <span className="hp-rowMetaIndent">{serviceUrl ?? '未配置 NEXUS_AI_SERVICE_URL'}</span>
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
