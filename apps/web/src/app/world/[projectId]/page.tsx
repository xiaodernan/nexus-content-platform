import Link from 'next/link';
import { notFound } from 'next/navigation';
import { buildWorldScene } from '@nexus/world-model';
import { listCharacters } from '@/server/domain/characters';
import { loadWorld } from '@/server/domain/worlds';
import { loadDocument } from '@/server/domain/projects';
import { projectVisibleTo } from '@/server/domain/team';
import { requireUser } from '@/server/domain/session';
import { WorldWalk } from '@/world3d/WorldWalk';

export const dynamic = 'force-dynamic';

/**
 * §140「进入世界」：`/world/<项目>`。渲染的是这个项目那一份世界文档的投影（§16）——
 * 位置来自 §45 图上摆过的坐标，条目就是九类内容，不另存一份"3D 场景文件"。
 *
 * 只有作者能进：世界没有发布链路（§56/§57 发布的是设计文档那一版），
 * 所以这里不做"公开可访问"的样子——按归属判定，不是就 404。
 */
export default async function WorldRuntimePage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const user = await requireUser();
  if (!(await projectVisibleTo(projectId, user.id))) notFound();

  const [world, project] = await Promise.all([loadWorld(projectId), loadDocument(projectId)]);
  if (!project) notFound();

  if (!world) {
    return (
      <main className="mx-auto flex max-w-[720px] flex-col gap-3 px-6 py-16" data-world3d="none">
        <div className="flex flex-col items-start gap-4 rounded-2xl border border-[var(--nexus-color-border-subtle)] bg-gradient-to-br from-bg-1 via-bg-2 to-bg-1 p-8">
          <span className="inline-flex h-12 w-12 items-center justify-center rounded-xl border border-[var(--nexus-color-brand)]/40 bg-gradient-to-br from-[var(--nexus-color-brand)]/20 via-bg-2 to-[var(--nexus-color-accent-2)]/20 text-[var(--nexus-color-accent-2-ink)]">
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 3a9 9 0 1 0 9 9 9 9 0 0 0-9-9Z" />
              <path d="M12 8a4 4 0 1 0 4 4 4 4 0 0 0-4-4Z" />
              <path d="M12 2v3m0 14v3M2 12h3m14 0h3" />
            </svg>
          </span>
          <div className="flex flex-col gap-1">
            <span className="font-mono text-10 uppercase tracking-[0.22em] text-[var(--nexus-color-accent-2-ink)]">
              WORLD
            </span>
            <h1 className="text-[var(--nexus-font-size-21)] font-semibold">这个项目还没有世界</h1>
          </div>
          <p className="max-w-md text-13 leading-6 text-fg-2">
            3D 运行时读的是世界文档（§44）与你在世界图（§45）上摆过的位置。先去 Studio 建骨架、填几条内容。
          </p>
          <Link
            href={`/studio/${projectId}`}
            className="mt-1 inline-flex min-h-10 items-center rounded-lg bg-[var(--nexus-color-brand)] px-4 py-2 text-13 font-semibold text-[var(--nexus-color-accent-fg)] transition-shadow hover:shadow-[0_0_24px_rgb(91_108_255/0.45)]"
          >
            回到 Studio 的世界面板 →
          </Link>
        </div>
      </main>
    );
  }
  if (!world.ok) {
    return (
      <main className="mx-auto flex max-w-[720px] flex-col gap-3 px-6 py-16" data-world3d="broken">
        <div className="flex flex-col items-start gap-4 rounded-2xl border border-[color:var(--nexus-color-brand)]/35 bg-gradient-to-br from-bg-1 via-bg-2 to-bg-1 p-8 shadow-[0_0_32px_rgb(91_108_255/0.12)]">
          <span className="inline-flex h-12 w-12 items-center justify-center rounded-xl border border-[var(--nexus-color-brand)]/40 bg-gradient-to-br from-[var(--nexus-color-brand)]/20 via-bg-2 to-[var(--nexus-color-accent-2)]/20 text-[var(--nexus-color-accent-2-ink)]">
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 9v4m0 4h.01M10.29 3.86 2.82 17a2 2 0 0 0 1.71 3h14.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
            </svg>
          </span>
          <div className="flex flex-col gap-1">
            <span className="font-mono text-10 uppercase tracking-[0.22em] text-[var(--nexus-color-accent-2-ink)]">
              UNREADABLE
            </span>
            <h1 className="text-[var(--nexus-font-size-21)] font-semibold">库里的世界读不出来</h1>
          </div>
          <p className="max-w-md text-13 leading-6 text-danger-ink" data-world-error>
            {world.reason}
          </p>
          <p className="max-w-md text-11 leading-5 text-fg-3">
            这里不会用一份空场景代替它：那看起来像"世界是空的"，而实际是读不出来。
          </p>
        </div>
      </main>
    );
  }

  const scene = buildWorldScene(world.document);
  // §140 的 talk 目标是 §46 角色档案：名册在服务端取好传下去，客户端不自己再拉一份
  const roster = await listCharacters(projectId);
  return (
    <div className="h-dvh w-full">
      <WorldWalk
        scene={scene}
        projectName={project.name}
        projectId={projectId}
        characters={roster.items.map((character) => ({
          id: character.id,
          name: character.profile.name || '（没有名字）',
        }))}
      />
    </div>
  );
}
