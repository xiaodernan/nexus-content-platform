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
  //
  // **但那不是一笔划算的账**（ADR-0048，2026-10-21 量到的）：
  // 10000 档时这份文档是 9.37MB，Next 要把它转成 RSC 载荷再塞进 HTML → **首屏多花约 6 秒**，
  // 而客户端本来就要取那一次（1.3 秒）。所以这里留一个**构建期开关**：
  // `NEXUS_STUDIO_SSR_DOCUMENT=0` 的构建不把文档塞进 HTML（首屏先出骨架，客户端那条老路取文档）。
  // 默认保持原样（带文档）——两个数要由产品拍板，不在这里替他决定（§159）。
  const ssrDocument = process.env.NEXUS_STUDIO_SSR_DOCUMENT !== '0';
  const initialDocument = ssrDocument ? await loadDocument(projectId) : null;
  return (
    <StudioShell
      projectId={projectId}
      demoMode={await isDemoMode()}
      initialDocument={initialDocument ?? undefined}
    />
  );
}
