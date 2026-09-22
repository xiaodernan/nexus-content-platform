import { notFound } from 'next/navigation';
import { StudioShell } from '@/studio/StudioShell';
import { isDemoMode } from '@/lib/env';
import { requireUser } from '@/server/domain/session';
import { projectBelongsTo } from '@/server/domain/projects';

export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ projectId: string }>;
}

export default async function StudioPage({ params }: Props) {
  const { projectId } = await params;
  const user = await requireUser();
  if (!(await projectBelongsTo(projectId, user.id))) notFound();
  return <StudioShell projectId={projectId} demoMode={await isDemoMode()} />;
}
