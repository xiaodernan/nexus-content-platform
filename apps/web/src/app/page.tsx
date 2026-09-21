import { getAiCapabilities } from '@/lib/env';
import { aiServiceUrl, fetchAiServiceHealth } from '@/server/ai/client';
import { requireUser } from '@/server/domain/session';
import { listProjects } from '@/server/domain/projects';
import { NewProjectForm } from '@/components/NewProjectForm';

export const dynamic = 'force-dynamic';

const MODALITIES = [
  { key: 'text', label: '文本 / 设计生成' },
  { key: 'image', label: '图像生成' },
  { key: 'video', label: '视频生成' },
] as const;

export default async function HomePage() {
  const caps = getAiCapabilities();
  const user = await requireUser();
  const projects = await listProjects(user.id);
  const serviceUrl = aiServiceUrl();
  const health = serviceUrl ? await fetchAiServiceHealth() : null;
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

      <section className="border-t border-[var(--nexus-color-border-subtle)] pt-[var(--nexus-space-6)]">
        <h2 className="mb-[var(--nexus-space-3)] text-[var(--nexus-font-size-16)] font-medium">项目</h2>
        <NewProjectForm />
        {projects.length ? (
          <ul className="mt-[var(--nexus-space-4)] grid gap-[var(--nexus-space-2)]">
            {projects.map((project) => (
              <li key={project.id}>
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
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-[var(--nexus-space-3)] text-[var(--nexus-font-size-13)] text-fg-3">还没有项目。创建一个即可进入 Studio 画布。</p>
        )}
      </section>

      <section className="border-t border-[var(--nexus-color-border-subtle)] pt-[var(--nexus-space-6)]">
        <h2 className="mb-[var(--nexus-space-3)] text-[var(--nexus-font-size-16)] font-medium">Provider 就绪状态</h2>
        <p className="mb-[var(--nexus-space-4)] text-[var(--nexus-font-size-13)] text-fg-3">
          读取自进程环境变量。未配置真实 key 时，生成链路走标注过的确定性 Mock，而不是伪装成功能可用（§159-160）。
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
