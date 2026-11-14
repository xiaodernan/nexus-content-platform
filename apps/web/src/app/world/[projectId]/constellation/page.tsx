import { notFound } from 'next/navigation';
import { listCharacters } from '@/server/domain/characters';
import { loadWorld } from '@/server/domain/worlds';
import { loadDocument } from '@/server/domain/projects';
import { projectVisibleTo } from '@/server/domain/team';
import { requireUser } from '@/server/domain/session';
import { buildConstellation } from '@/lib/constellation';
import { ConstellationPanel } from '@/components/ConstellationPanel';

export const dynamic = 'force-dynamic';

/**
 * 「人物关系星图」—— 世界的星图：谁连着谁、谁还没被连上这个世界。
 *
 * 只有作者能进（与 /world/<项目> 同一道门）：世界没有发布链路，星图不是公开页。
 * 数据全部来自库：characters.profile（§46）+ worlds 文档（§44）的节点标题。
 * 世界文档读不出来 ⇒ 关系页照常打开，只是不画世界锚点（脚注说清），不 500、不假装。
 */
export default async function ConstellationPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const user = await requireUser();
  if (!(await projectVisibleTo(projectId, user.id))) notFound();

  const [roster, world, project] = await Promise.all([
    listCharacters(projectId),
    loadWorld(projectId),
    loadDocument(projectId),
  ]);
  if (!project) notFound();

  const worldOk = world && world.ok ? world.document : null;
  const graph = buildConstellation(
    roster.items,
    worldOk ? worldOk.nodes.map((node) => ({ id: node.id, title: node.title })) : [],
  );
  const worldNodeTitles: Record<string, string> = worldOk
    ? Object.fromEntries(worldOk.nodes.map((node) => [node.id, node.title]))
    : {};

  return (
    <ConstellationPanel
      projectName={project.name}
      projectId={projectId}
      characters={roster.items}
      worldNodeTitles={worldNodeTitles}
      graph={graph}
    />
  );
}
