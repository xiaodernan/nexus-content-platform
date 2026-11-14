import { notFound } from 'next/navigation';
import { loadWorld } from '@/server/domain/worlds';
import { loadDocument } from '@/server/domain/projects';
import { projectVisibleTo } from '@/server/domain/team';
import { requireUser } from '@/server/domain/session';
import { listCharacters } from '@/server/domain/characters';
import { buildChronicle } from '@/lib/chronicle';
import { ChronicleView } from '@/components/ChronicleView';

export const dynamic = 'force-dynamic';

export default async function ChroniclePage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const user = await requireUser();
  if (!(await projectVisibleTo(projectId, user.id))) notFound();

  const [world, project, roster] = await Promise.all([
    loadWorld(projectId),
    loadDocument(projectId),
    listCharacters(projectId),
  ]);
  if (!project) notFound();

  const worldOk = world && world.ok ? world.document : null;
  const eras = worldOk ? buildChronicle(worldOk.nodes) : [];
  const characters = roster.items.map((character) => ({
    id: character.id,
    name: character.profile.name || '（没有名字）',
    activeEra: character.profile.activeEra,
  }));

  return <ChronicleView worldName={project.name} eras={eras} characters={characters} projectId={projectId} />;
}
