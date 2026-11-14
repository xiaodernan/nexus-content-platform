import { notFound } from 'next/navigation';
import { loadWorld } from '@/server/domain/worlds';
import { loadDocument } from '@/server/domain/projects';
import { projectVisibleTo } from '@/server/domain/team';
import { requireUser } from '@/server/domain/session';
import { buildChronicle } from '@/lib/chronicle';
import { ChronicleView } from '@/components/ChronicleView';

export const dynamic = 'force-dynamic';

/**
 * 「世界编年」—— 世界的年表。只有项目作者能进（与 /world 同一道门）。
 * 数据来自世界文档的 story/history 条目；世界读不出来 ⇒ 年表不画，页面说明缺什么（不 500、不假装）。
 */
export default async function ChroniclePage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const user = await requireUser();
  if (!(await projectVisibleTo(projectId, user.id))) notFound();

  const [world, project] = await Promise.all([loadWorld(projectId), loadDocument(projectId)]);
  if (!project) notFound();

  const worldOk = world && world.ok ? world.document : null;
  const eras = worldOk ? buildChronicle(worldOk.nodes) : [];

  return <ChronicleView worldName={project.name} eras={eras} />;
}
