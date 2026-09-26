import { notFound } from 'next/navigation';
import { StudioShell } from '@/studio/StudioShell';
import { isDemoMode } from '@/lib/env';
import { requireUser } from '@/server/domain/session';
import { loadDocument, projectBelongsTo } from '@/server/domain/projects';

export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ projectId: string }>;
}

export default async function StudioPage({ params }: Props) {
  const { projectId } = await params;
  const user = await requireUser();
  if (!(await projectBelongsTo(projectId, user.id))) notFound();
  // 首屏那一份文档由服务端读出来随 HTML 下来：省掉"水合完再去 fetch 一次"的那趟往返
  // （生产实测那一次项目接口是 152-206ms）。读不到时不装作读过——交回原来的客户端路径。
  const initialDocument = await loadDocument(projectId);
  return (
    <StudioShell
      projectId={projectId}
      demoMode={await isDemoMode()}
      initialDocument={initialDocument ?? undefined}
    />
  );
}
