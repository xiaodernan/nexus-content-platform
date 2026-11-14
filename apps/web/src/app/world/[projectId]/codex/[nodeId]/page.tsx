import { notFound } from 'next/navigation';
import Link from 'next/link';
import type { Metadata } from 'next';
import { loadWorld } from '@/server/domain/worlds';
import { loadDocument } from '@/server/domain/projects';
import { projectVisibleTo } from '@/server/domain/team';
import { requireUser } from '@/server/domain/session';
import { findWorldNode, WORLD_KIND_LABELS } from '@nexus/world-model';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: '设定集 · 单章 · NEXUS',
  description: '世界设定集：单个落笔节点的纸面投影。',
};

/**
 * §v710「一页书」——把每个落笔节点化为一册独立可读的 "
 * 这一节点的完整设定。只有作者（同 /world/codex 的门）。
 * 章体 = 世界文档的 body 原文（按段落分拆）；不在正文里插嘴一句话；
 * 页面只负责把节点 "
 */

export default async function CodexChapterPage({
  params,
}: {
  params: Promise<{ projectId: string; nodeId: string }>;
}) {
  const { projectId, nodeId } = await params;
  const user = await requireUser();
  if (!(await projectVisibleTo(projectId, user.id))) notFound();

  const [world, project] = await Promise.all([loadWorld(projectId), loadDocument(projectId)]);
  if (!project) notFound();

  const worldOk = world && world.ok ? world.document : null;
  const node = worldOk ? findWorldNode(worldOk, nodeId) : undefined;
  if (!node) notFound();

  const kindLabel = WORLD_KIND_LABELS[node.kind] ?? node.kind;
  const paragraphs = node.body
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);

  return (
    <main className="cdr-root" data-codex-chapter-root>
      <article className="cdr-article">
        <header className="cdr-hero">
          <p className="cdr-kicker" data-codex-chapter-kicker>CODEX · {project.name}</p>
          <p className="cdr-kind" data-codex-chapter-kind>{kindLabel}</p>
          <h1 className="cdr-title" data-codex-chapter-title>{node.title}</h1>
          <p className="cdr-footnote" data-codex-chapter-footnote>仅作者可见 · 本页仅由 worlds.document 原文渲染 · 零写库</p>
        </header>

        {paragraphs.length === 0 ? (
          <p className="cdr-empty" data-codex-chapter-empty>这条目还没有落笔——它在世界文档里只是一个模板条目。</p>
        ) : (
          paragraphs.map((p, i) => (
            <p key={i} className={`cdr-para${i === 0 ? ' cdr-paraFirst' : ''}`}>{p}</p>
          ))
        )}

        <footer className="cdr-foot" data-codex-chapter-foot>
          <Link className="am-linkImplicit" href={`/world/${projectId}/codex#cdx-chapter-${node.kind}`} data-codex-chapter-back>← 返回设定集</Link>
          <Link className="am-linkImplicit" href={`/world/${projectId}`} data-codex-chapter-back-graph>← 回到世界图</Link>
        </footer>
      </article>
    </main>
  );
}
