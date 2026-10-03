import { getAiCapabilities } from '@/lib/env';
import { aiServiceUrl, fetchAiServiceHealth } from '@/server/ai/client';
import { requireUser } from '@/server/domain/session';
import { listDeletedProjects, listProjects } from '@/server/domain/projects';
import { NewProjectForm } from '@/components/NewProjectForm';
import { ImportPanel } from '@/components/ImportPanel';
import { AccountPanel } from '@/components/AccountPanel';
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
    <main className="mx-auto flex min-h-screen max-w-[820px] flex-col gap-[var(--nexus-space-8)] px-[var(--nexus-space-6)] py-[var(--nexus-space-12)]">
      <header className="flex items-baseline justify-between gap-[var(--nexus-space-4)]">
        <div>
          <h1 className="text-[var(--nexus-font-size-28)] font-semibold tracking-tight">NEXUS</h1>
          <p className="text-[var(--nexus-font-size-14)] text-fg-2">Describe it. Design it. Generate it. Build it. Enter it.</p>
        </div>
        <span
          className="rounded-[var(--nexus-radius-sm)] border border-[var(--nexus-color-border-strong)] px-[var(--nexus-space-3)] py-[var(--nexus-space-1)] font-mono text-[var(--nexus-font-size-12)] text-fg-2"
          data-demo-mode={caps.live ? 'off' : 'on'}
        >
          {caps.live ? 'LIVE PROVIDER' : 'DEMO MODE'}
        </span>
      </header>

      <nav className="flex items-center gap-3 text-13" data-site-nav>
        <a href="/search" className="text-accent-2 underline" data-nav-search>
          全平台搜索
        </a>
        <a href="/discover" className="text-accent-2 underline" data-nav-discover>
          发现
        </a>
        <a href="/analytics" className="text-accent-2 underline" data-nav-analytics>
          创作数据
        </a>
        <a href="/blocks" className="text-accent-2 underline" data-nav-blocks>
          已拉黑与已屏蔽
        </a>
        <NotificationBell />
        <span className="text-fg-3">公开在跑的作品与全平台的内容搜索；数据与通知只对登录后的你自己可见</span>
      </nav>

      <section className="border-t border-[var(--nexus-color-border-subtle)] pt-[var(--nexus-space-6)]">
        <h2 className="mb-[var(--nexus-space-3)] text-[var(--nexus-font-size-16)] font-medium">账号</h2>
        <AccountPanel user={user} />
      </section>

      <section className="border-t border-[var(--nexus-color-border-subtle)] pt-[var(--nexus-space-6)]">
        <h2 className="mb-[var(--nexus-space-3)] text-[var(--nexus-font-size-16)] font-medium">项目</h2>
        <NewProjectForm />
        <ImportPanel />
        {projects.length ? (
          <ul className="mt-[var(--nexus-space-4)] grid gap-[var(--nexus-space-3)]">
            {projects.map((project) => (
              <li key={project.id} className="grid gap-[var(--nexus-space-2)]">
                <a
                  href={`/studio/${project.id}`}
                  className="flex items-center justify-between rounded-[var(--nexus-radius-sm)] bg-bg-1 px-[var(--nexus-space-4)] py-[var(--nexus-space-3)] hover:bg-bg-2"
                  data-project-row={project.id}
                >
                  <span className="text-[var(--nexus-font-size-14)]">{project.name}</span>
                  <span className="font-mono text-[var(--nexus-font-size-12)] text-fg-3">
                    {project.kind} · {new Date(project.updatedAt).toLocaleString('zh-CN', { hour12: false })}
                  </span>
                </a>
                <div className="px-[var(--nexus-space-4)]">
                  <ProjectDescriptionEditor projectId={project.id} initialDescription={project.description} />
                </div>
                <div className="px-[var(--nexus-space-4)]">
                  <ProjectDeleteCard projectId={project.id} projectName={project.name} />
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-[var(--nexus-space-3)] text-[var(--nexus-font-size-13)] text-fg-3">还没有项目。创建一个即可进入 Studio 画布。</p>
        )}
      </section>

      <section className="border-t border-[var(--nexus-color-border-subtle)] pt-[var(--nexus-space-6)]">
        <h2 className="mb-[var(--nexus-space-2)] text-[var(--nexus-font-size-16)] font-medium">回收站（{deleted.length}）</h2>
        <p className="mb-[var(--nexus-space-3)] text-[var(--nexus-font-size-13)] text-fg-3">
          删掉的项目不再出现在项目列表、搜索、发现和创作数据里，公开页与分享链接也从那一刻打不开。
          快照、发布记录与评论都还留着，恢复后回到上面的列表。
        </p>
        {deleted.length ? (
          <ul className="grid gap-[var(--nexus-space-2)]" data-deleted-list>
            {deleted.map((item) => (
              <li
                key={item.id}
                className="flex items-center justify-between gap-[var(--nexus-space-3)] rounded-[var(--nexus-radius-sm)] bg-bg-1 px-[var(--nexus-space-4)] py-[var(--nexus-space-3)]"
                data-deleted-row={item.id}
              >
                <span className="text-[var(--nexus-font-size-14)] text-fg-2">
                  {item.name}
                  <span className="ml-[var(--nexus-space-2)] font-mono text-[var(--nexus-font-size-12)] text-fg-3">
                    {item.kind} · 删除于 {new Date(item.deletedAt).toLocaleString('zh-CN', { hour12: false })}
                  </span>
                </span>
                <RestoreProjectButton projectId={item.id} projectName={item.name} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[var(--nexus-font-size-13)] text-fg-3" data-deleted-empty>
            回收站是空的。删除一个项目需要在上面逐字输入它的名字——这一步由服务端判定，不是界面上的弹窗。
          </p>
        )}
      </section>

      <section className="border-t border-[var(--nexus-color-border-subtle)] pt-[var(--nexus-space-6)]">
        <h2 className="mb-[var(--nexus-space-3)] text-[var(--nexus-font-size-16)] font-medium">我的主页</h2>
        {account.handle ? (
          <p className="mb-[var(--nexus-space-3)] text-[var(--nexus-font-size-13)]">
            <a href={`/u/${account.handle}`} className="text-accent-2 underline" data-my-profile-link>
              /u/{account.handle}
            </a>
            <span className="ml-[var(--nexus-space-2)] text-fg-3">这里只会出现你公开过的作品</span>
          </p>
        ) : (
          <p className="mb-[var(--nexus-space-3)] text-[var(--nexus-font-size-13)] text-fg-3" data-my-profile-link="none">
            你还没有可用于主页的地址（handle 在首次发布时生成）。
          </p>
        )}
        <AvatarEditor initialUrl={account.avatarUrl} />
        <div className="mt-[var(--nexus-space-4)]">
          <ProfileEditor initialBio={account.bio} />
        </div>

        <h3 className="mb-[var(--nexus-space-2)] mt-[var(--nexus-space-5)] text-[var(--nexus-font-size-14)] font-medium">
          我收藏的版本（{saved.length}）
        </h3>
        {saved.length ? (
          <ul className="grid gap-[var(--nexus-space-2)]" data-saved-list>
            {saved.map((card) => (
              <li key={card.publicationId} data-saved-row={card.publicationId}>
                {card.unavailableReason ? (
                  <span className="flex items-center justify-between rounded-[var(--nexus-radius-sm)] bg-bg-1 px-[var(--nexus-space-4)] py-[var(--nexus-space-3)] text-fg-3">
                    <span>{card.name}</span>
                    <span className="font-mono text-12">{card.unavailableReason}</span>
                  </span>
                ) : (
                  <a
                    href={card.path}
                    className="flex items-center justify-between rounded-[var(--nexus-radius-sm)] bg-bg-1 px-[var(--nexus-space-4)] py-[var(--nexus-space-3)] hover:bg-bg-2"
                  >
                    <span className="text-[var(--nexus-font-size-14)]">
                      {card.name}
                      <span className="ml-[var(--nexus-space-2)] text-12 text-fg-3">by {card.owner}</span>
                    </span>
                    <span className="font-mono text-12 text-fg-3">
                      {card.views} 浏览 · {card.likes} 赞 · 收藏于 {new Date(card.savedAt).toLocaleDateString('zh-CN')}
                    </span>
                  </a>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[var(--nexus-font-size-13)] text-fg-3" data-saved-empty>
            还没有收藏。在任意公开作品页点「收藏这一版」，收下的就是那一刻的那一版——作者之后重新发布不会换掉它。
          </p>
        )}
      </section>

      <section className="border-t border-[var(--nexus-color-border-subtle)] pt-[var(--nexus-space-6)]">
        <h2 className="mb-[var(--nexus-space-3)] text-[var(--nexus-font-size-16)] font-medium">Provider 就绪状态</h2>
        <p className="mb-[var(--nexus-space-4)] text-[var(--nexus-font-size-13)] text-fg-3">
          读取自 AI Service 的 /healthz（provider key 只存在于 ai-service 进程，web 不持有）。未配置真实 key 时，生成链路走标注过的确定性 Mock，而不是伪装成功能可用（§159-160）。
        </p>
        <ul className="grid gap-[var(--nexus-space-2)]">
          {MODALITIES.map((m) => (
            <li key={m.key} className="flex items-center justify-between rounded-[var(--nexus-radius-sm)] bg-bg-1 px-[var(--nexus-space-4)] py-[var(--nexus-space-3)]">
              <span className="text-[var(--nexus-font-size-14)]">{m.label}</span>
              <span className="font-mono text-[var(--nexus-font-size-12)] uppercase text-fg-2">{caps[m.key]}</span>
            </li>
          ))}
          <li className="flex items-center justify-between rounded-[var(--nexus-radius-sm)] bg-bg-1 px-[var(--nexus-space-4)] py-[var(--nexus-space-3)]" data-ai-service={serviceState}>
            <span className="text-[var(--nexus-font-size-14)]">
              AI Service
              <span className="ml-[var(--nexus-space-2)] font-mono text-[var(--nexus-font-size-12)] text-fg-3">{serviceUrl ?? '未配置 NEXUS_AI_SERVICE_URL'}</span>
            </span>
            <span className="font-mono text-[var(--nexus-font-size-12)] uppercase text-fg-2">{serviceLabel}</span>
          </li>
        </ul>
        {health ? (
          <ul className="mt-[var(--nexus-space-2)] grid gap-[var(--nexus-space-1)]">
            {health.providers.map((p) => (
              <li key={`${p.kind}:${p.name}`} className="flex items-center justify-between px-[var(--nexus-space-4)] font-mono text-[var(--nexus-font-size-12)]">
                <span className="text-fg-3">{p.kind} · {p.name}{p.models.length ? ` · ${p.models.join('/')}` : ''}</span>
                <span className="uppercase text-fg-2" title={p.reason}>{p.status}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </section>
    </main>
  );
}
