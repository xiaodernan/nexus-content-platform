import { notFound } from 'next/navigation';
import { StudioShell } from '@/studio/StudioShell';
import { isDemoMode } from '@/lib/env';
import { requireUser } from '@/server/domain/session';
import { loadDocument } from '@/server/domain/projects';
import { projectVisibleTo } from '@/server/domain/team';

export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ projectId: string }>;
}

export default async function StudioPage({ params }: Props) {
  const { projectId } = await params;
  const user = await requireUser();
  if (!(await projectVisibleTo(projectId, user.id))) notFound();
  // 首屏那一份文档由服务端读出来，但**不阻塞首帧**（§147 第三片，2026-10-23）：
  // 这里创建 promise 之后**不 await**——React 先把 shell flush 出去，文档读取
  // （10000 档约 434ms）与首帧重叠；文档字节作为同一个响应的后续 chunk 流下来，
  // 客户端不用再 fetch 一趟（那条老路只在 `NEXUS_STUDIO_SSR_DOCUMENT=0` 时走）。
  //
  // 三段历史的判决都留着，别重新发明：
  // - ADR-0048：整份文档随 HTML 同步下来，10000 档 9.37MB、首屏多花约 6 秒；
  // - 2026-10-21 实测量过"不带文档"：首帧早 400~850ms，但画布容器反而晚 ~450~520ms
  //   （要等客户端那次 fetch），首次编辑慢约一倍——两个数要由产品拍板；
  // - **流式是兼得那条**：HTML 早到（不带文档的好处）＋ 文档仍在这一次响应里
  //   （不用客户端往返，画布容器不必等第二次网络）。
  // 读失败按"没有文档"处理：`studio.load()` 那条客户端老路照旧能救场（§159 不装作读过）。
  const ssrDocument = process.env.NEXUS_STUDIO_SSR_DOCUMENT !== '0';
  const documentPromise = ssrDocument ? loadDocument(projectId).catch(() => null) : null;
  return (
    <StudioShell
      projectId={projectId}
      demoMode={await isDemoMode()}
      documentPromise={documentPromise ?? undefined}
    />
  );
}
