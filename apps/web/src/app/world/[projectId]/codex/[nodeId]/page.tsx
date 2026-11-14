import { notFound } from 'next/navigation';
import Link from 'next/link';
import type { Metadata } from 'next';
import { loadWorld } from '@/server/domain/worlds';
import { loadDocument } from '@/server/domain/projects';
import { projectVisibleTo } from '@/server/domain/team';
import { requireUser } from '@/server/domain/session';
import { getLocale } from '@/lib/i18n';
import { findWorldNode, WORLD_KIND_LABELS, type WorldKind } from '@nexus/world-model';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: '设定集 · 单章 · NEXUS',
  description: '世界设定集：单个落笔节点的纸面投影。',
};

/**
 * 「一页书」——把每个落笔节点化为一页独立可读的章。
 * 章体 = 世界文档的 body 原文（按段落分拆）；不在正文里插嘴一句话。
 * 页面只负责把节点装订成纸。作者真值，机翻不用（双语只翻 UI 文案，v727）。
 */

const KIND_LABEL_EN: Record<WorldKind, string> = {
  lore: 'Lore',
  history: 'History',
  geography: 'Geography',
  factions: 'Factions',
  characters: 'Characters',
  creatures: 'Creatures',
  items: 'Items',
  quests: 'Quests',
  story: 'Story',
};

const COPY = {
  zh: {
    kickerPrefix: 'CODEX',
    footnote: '仅作者可见 · 本页仅由 worlds.document 原文渲染 · 零写库',
    empty: '这条目还没有落笔——它在世界文档里只是一个模板条目。',
    footBack: '← 返回设定集',
    footBackGraph: '← 回到世界图',
  },
  en: {
    kickerPrefix: 'CODEX',
    footnote: 'Author-only · raw world document rendering, nothing else · zero writes',
    empty: 'This node was never written — in the world document it is still a template entry.',
    footBack: '← Back to the Codex',
    footBackGraph: '← Back to the world',
  },
} as const;

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

  const locale = await getLocale();
  const c = COPY[locale];

  const worldOk = world && world.ok ? world.document : null;
  const node = worldOk ? findWorldNode(worldOk, nodeId) : undefined;
  if (!node) notFound();

  const kindLabel = (locale === 'en' ? KIND_LABEL_EN[node.kind] : null) ?? WORLD_KIND_LABELS[node.kind] ?? node.kind;
  const paragraphs = node.body
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);

  return (
    <main className="cdr-root" data-codex-chapter-root>
      <article className="cdr-article">
        <header className="cdr-hero">
          <p className="cdr-kicker" data-codex-chapter-kicker>{c.kickerPrefix} · {project.name}</p>
          <p className="cdr-kind" data-codex-chapter-kind>{kindLabel}</p>
          <h1 className="cdr-title" data-codex-chapter-title>{node.title}</h1>
          <p className="cdr-footnote" data-codex-chapter-footnote>{c.footnote}</p>
        </header>

        {paragraphs.length === 0 ? (
          <p className="cdr-empty" data-codex-chapter-empty>{c.empty}</p>
        ) : (
          paragraphs.map((p, i) => (
            <p key={i} className={`cdr-para${i === 0 ? ' cdr-paraFirst' : ''}`}>{p}</p>
          ))
        )}

        <footer className="cdr-foot" data-codex-chapter-foot>
          <Link className="am-linkImplicit" href={`/world/${projectId}/codex#cdx-chapter-${node.kind}`} data-codex-chapter-back>{c.footBack}</Link>
          <Link className="am-linkImplicit" href={`/world/${projectId}`} data-codex-chapter-back-graph>{c.footBackGraph}</Link>
        </footer>
      </article>
    </main>
  );
}
