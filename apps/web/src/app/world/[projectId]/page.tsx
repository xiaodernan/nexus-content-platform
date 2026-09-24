import Link from 'next/link';
import { notFound } from 'next/navigation';
import { buildWorldScene } from '@nexus/world-model';
import { loadWorld } from '@/server/domain/worlds';
import { loadDocument, projectBelongsTo } from '@/server/domain/projects';
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
  if (!(await projectBelongsTo(projectId, user.id))) notFound();

  const [world, project] = await Promise.all([loadWorld(projectId), loadDocument(projectId)]);
  if (!project) notFound();

  if (!world) {
    return (
      <main className="mx-auto flex max-w-[720px] flex-col gap-3 px-6 py-16" data-world3d="none">
        <h1 className="text-[var(--nexus-font-size-21)] font-semibold">这个项目还没有世界</h1>
        <p className="text-13 text-fg-2">
          3D 运行时读的是世界文档（§44）与你在世界图（§45）上摆过的位置。先去 Studio 建骨架、填几条内容。
        </p>
        <Link href={`/studio/${projectId}`} className="text-13 text-accent-2 underline">
          回到 Studio 的世界面板
        </Link>
      </main>
    );
  }
  if (!world.ok) {
    return (
      <main className="mx-auto flex max-w-[720px] flex-col gap-3 px-6 py-16" data-world3d="broken">
        <h1 className="text-[var(--nexus-font-size-21)] font-semibold">库里的世界读不出来</h1>
        <p className="text-13 text-danger" data-world-error>
          {world.reason}
        </p>
        <p className="text-11 text-fg-3">这里不会用一份空场景代替它：那看起来像"世界是空的"，而实际是读不出来。</p>
      </main>
    );
  }

  const scene = buildWorldScene(world.document);
  return (
    <div className="h-dvh w-full">
      <WorldWalk scene={scene} projectName={project.name} />
    </div>
  );
}
