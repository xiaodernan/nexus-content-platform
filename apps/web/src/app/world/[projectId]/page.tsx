import Link from 'next/link';
import { notFound } from 'next/navigation';
import { buildWorldScene } from '@nexus/world-model';
import { listCharacters } from '@/server/domain/characters';
import { loadWorld } from '@/server/domain/worlds';
import { loadDocument } from '@/server/domain/projects';
import { projectVisibleTo } from '@/server/domain/team';
import { requireUser } from '@/server/domain/session';
import { getLocale, type Locale } from '@/lib/i18n';
import { WorldWalk } from '@/world3d/WorldWalk';

export const dynamic = 'force-dynamic';

const COPY: Record<Locale, {
  noWorldTitle: string;
  noWorldBody: string;
  noWorldLink: string;
  brokenTitle: string;
  brokenNote: string;
  noCharacters: string;
}> = {
  zh: {
    noWorldTitle: '这个项目还没有世界',
    noWorldBody: '3D 运行时读的是世界文档（§44）与你在世界图（§45）上摆过的位置。先去 Studio 建骨架、填几条内容。',
    noWorldLink: '回到 Studio 的世界面板',
    brokenTitle: '库里的世界读不出来',
    brokenNote: '这里不会用一份空场景代替它：那看起来像"世界是空的"，而实际是读不出来。',
    noCharacters: '（没有名字）',
  },
  en: {
    noWorldTitle: 'This project has no world yet',
    noWorldBody: 'The 3D runtime reads the world document (§44) and the positions you placed on the world graph (§45). Build the skeleton and fill a few entries in Studio first.',
    noWorldLink: 'Back to the Studio world panel',
    brokenTitle: 'The world in the library cannot be read',
    brokenNote: 'No empty scene will stand in for it: that would look like “the world is empty” when in fact it cannot be read.',
    noCharacters: '(no name)',
  },
};

/**
 * §140「进入世界」：`/world/<项目>`。渲染的是这个项目那一份世界文档的投影（§16）——
 * 位置来自 §45 图上摆过的坐标，条目就是九类内容，不另存一份"3D 场景文件"。
 *
 * 只有作者能进：世界没有发布链路（§56/§57 发布的是设计文档那一版），
 * 所以这里不做"公开可访问"的样子——按归属判定，不是就 404。
 */
export default async function WorldRuntimePage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const locale = await getLocale();
  const user = await requireUser();
  if (!(await projectVisibleTo(projectId, user.id))) notFound();

  const [world, project] = await Promise.all([loadWorld(projectId), loadDocument(projectId)]);
  if (!project) notFound();

  if (!world) {
    return (
      <main className="rt-shell" data-world3d="none">
        <h1 className="rt-title">{COPY[locale].noWorldTitle}</h1>
        <p className="rt-lede">
          {COPY[locale].noWorldBody}
        </p>
        <Link href={`/studio/${projectId}`} className="rt-link">
          {COPY[locale].noWorldLink}
        </Link>
      </main>
    );
  }
  if (!world.ok) {
    return (
      <main className="rt-shell" data-world3d="broken">
        <h1 className="rt-title">{COPY[locale].brokenTitle}</h1>
        <p className="rt-error" data-world-error>
          {world.reason}
        </p>
        <p className="rt-note">{COPY[locale].brokenNote}</p>
      </main>
    );
  }

  const scene = buildWorldScene(world.document);
  // §140 的 talk 目标是 §46 角色档案：名册在服务端取好传下去，客户端不自己再拉一份
  const roster = await listCharacters(projectId);
  return (
    <div className="rt-stage">
      <WorldWalk
        scene={scene}
        projectName={project.name}
        projectId={projectId}
        characters={roster.items.map((character) => ({
          id: character.id,
          name: character.profile.name || COPY[locale].noCharacters,
        }))}
        locale={locale}
      />
    </div>
  );
}
