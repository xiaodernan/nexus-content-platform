import { notFound } from 'next/navigation';
import { loadWorld } from '@/server/domain/worlds';
import { loadDocument } from '@/server/domain/projects';
import { projectVisibleTo } from '@/server/domain/team';
import { requireUser } from '@/server/domain/session';
import type { WorldKind } from '@nexus/world-model';
import type { ChronicleEntry } from '@/lib/chronicle';

export const dynamic = 'force-dynamic';

/**
 * 「记忆回廊」—— 世界里每一段被刻下来的回声，连成一条走廊。
 * 只有故事/历史/地理条目里的 `memory` 才进这里：这是有刻痕的记忆，不是流水账。
 * 零写库：纯投影；读不到就说读不到，不补假回声。
 * 排列：按纪元（有序）→ 按 kind → 按 updatedAt 升序（最老的在最前——年表是回忆，不是新闻）。
 */
export default async function MemoriesPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const user = await requireUser();
  if (!(await projectVisibleTo(projectId, user.id))) notFound();

  const [world, project] = await Promise.all([loadWorld(projectId), loadDocument(projectId)]);
  if (!project) notFound();

  const worldOk = world && world.ok ? world.document : null;
  const entries: ChronicleEntry[] = worldOk
    ? worldOk.nodes
        .filter((n) => typeof n.lore?.memory === 'string' && n.lore.memory.trim().length > 0)
        .map((n): ChronicleEntry => ({
          id: n.id,
          title: n.title.trim(),
          kind: n.kind as WorldKind,
          kindLabel: n.kind === 'history' ? '历史' : n.kind === 'story' ? '故事' : '其它',
          era: (n.lore?.era ?? '').trim() || '未标纪元',
          order: typeof n.lore?.order === 'number' ? (n.lore!.order as number) : Number.MAX_SAFE_INTEGER,
          memory: n.lore?.memory,
          updatedAt: n.updatedAt,
        }))
        .sort((a, b) => {
          const ea = a.era === '未标纪元' ? '￰' : a.era;
          const eb = b.era === '未标纪元' ? '￰' : b.era;
          if (ea !== eb) return ea < eb ? -1 : 1;
          const oa = a.order;
          const ob = b.order;
          if (oa !== ob) return oa - ob;
          return Date.parse(a.updatedAt) - Date.parse(b.updatedAt);
        })
    : [];

  return (
    <main className="mem-root" data-memories-root>
      <header className="mem-head">
        <div>
          <p className="mem-kicker">MEMORIES · {project.name}</p>
          <h1 className="mem-title">记忆回廊</h1>
          <p className="mem-lede">
            世界里被刻下来的回声。每一条都来自真实条目的 <code className="mem-code">memory</code> 字段——不是梗概，不是人设，是一句"你在场时听到了什么"。
          </p>
        </div>
        <nav className="world-nav" aria-label="世界子页导航">
          <a href={`/world/${projectId}/almanac`} className="world-navLink">世界藏经阁</a>
          <a href={`/world/${projectId}/atlas`} className="world-navLink">寰宇图志</a>
          <a href={`/world/${projectId}/chronicle`} className="world-navLink">世界编年</a>
          <a href={`/world/${projectId}/constellation`} className="world-navLink">角色星图</a>
          <a href={`/world/${projectId}/quiz`} className="world-navLink world-navLinkQuiz">谜灯馆</a>
        </nav>
      </header>

      {entries.length === 0 ? (
        <div className="mem-empty" data-memories-empty>
          <p className="mem-emptyTitle">还没有被刻下的回声。</p>
          <p className="mem-emptyCopy">去 Studio 的世界面板，给 story / history 条目写一刻 memory——世界就会在此处低声复述它。</p>
        </div>
      ) : (
        <ol className="mem-list">
          {entries.map((entry) => (
            <li
              key={entry.id}
              className="mem-item"
              data-memories-entry={entry.id}
            >
              <span
                aria-hidden="true"
                className="mem-pin"
              />
              <div className="mem-row">
                <div className="mem-rowMeta">
                  <span className="mem-era" data-memories-era>{entry.era}</span>
                  <span className="mem-kind" data-memories-kind>{entry.kindLabel}</span>
                </div>
                <time className="mem-when" dateTime={entry.updatedAt}>{entry.updatedAt.slice(0, 10)}</time>
              </div>
              <p className="mem-entryTitle">{entry.title}</p>
              {entry.memory ? (
                <blockquote className="mem-quote" data-memories-quote>“{entry.memory}”</blockquote>
              ) : null}
            </li>
          ))}
        </ol>
      )}
    </main>
  );
}
