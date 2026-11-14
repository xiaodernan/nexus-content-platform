import { notFound } from 'next/navigation';
import { loadWorld } from '@/server/domain/worlds';
import { loadDocument } from '@/server/domain/projects';
import { projectVisibleTo } from '@/server/domain/team';
import { requireUser } from '@/server/domain/session';
import type { WorldKind } from '@nexus/world-model';
import { seedFromString, type QuizNodeInput } from '@/lib/quiz';
import { QuizArcade } from '@/components/QuizArcade';

export const dynamic = 'force-dynamic';

/**
 * 「谜灯馆」v717 —— 世界文档的交互投影：八盏灯，凭记忆点亮。
 * 题面与选项全部来自这份世界文档（见 lib/quiz.ts 的同输入同输出铁律）；
 * 零写库、不保存成绩；归属判定 = projectVisibleTo，未授权 404。
 */
export default async function QuizPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const user = await requireUser();
  if (!(await projectVisibleTo(projectId, user.id))) notFound();

  const [world, project] = await Promise.all([loadWorld(projectId), loadDocument(projectId)]);
  if (!project) notFound();

  const worldOk = world && world.ok ? world.document : null;
  const nodes: QuizNodeInput[] = worldOk
    ? worldOk.nodes.map((n) => ({
        id: n.id,
        kind: n.kind as WorldKind,
        title: typeof n.title === 'string' ? n.title.trim() : '',
        body: typeof n.body === 'string' ? n.body.trim() : '',
        updatedAt: typeof n.updatedAt === 'string' ? n.updatedAt : '',
        lore: n.lore,
      }))
    : [];
  const worldName = worldOk?.name ?? project.name;

  return (
    <QuizArcade
      nodes={nodes}
      worldName={worldName}
      projectId={projectId}
      initialSeed={seedFromString(worldOk?.id ?? projectId) ^ 0x1e3779b9}
    />
  );
}
