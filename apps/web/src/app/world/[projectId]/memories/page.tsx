import { notFound } from 'next/navigation';
import { loadWorld } from '@/server/domain/worlds';
import { loadDocument } from '@/server/domain/projects';
import { projectVisibleTo } from '@/server/domain/team';
import { requireUser } from '@/server/domain/session';
import { getLocale, type Locale } from '@/lib/i18n';
import type { WorldKind } from '@nexus/world-model';
import type { ChronicleEntry } from '@/lib/chronicle';

export const dynamic = 'force-dynamic';

/**
 * 「记忆回廊」—— 世界里每一段被刻下来的回声，连成一条走廊。
 * 只有故事/历史/地理条目里的 `memory` 才进这里：这是有刻痕的记忆，不是流水账。
 * 零写库：纯投影；读不到就说读不到，不补假回声。
 * 排列：按纪元（有序）→ 按 kind → 按 updatedAt 升序（最老的在最前——年表是回忆，不是新闻）。
 * 全站双语（v733）：COPY 中英一辞两字面，locale 由 getLocale() 读，不夹杂。
 */
const COPY: Record<Locale, {
  kicker: (project: string) => string;
  title: string;
  ledePre: string;
  ledePost: string;
  navAlmanac: string;
  navAtlas: string;
  navChronicle: string;
  navConstellation: string;
  navQuiz: string;
  navAria: string;
  emptyTitle: string;
  emptyCopy: string;
  eraDefault: string;
  kindHistory: string;
  kindStory: string;
  kindOther: string;
}> = {
  zh: {
    kicker: (project) => `MEMORIES · ${project}`,
    title: '记忆回廊',
    ledePre: '世界里被刻下来的回声。每一条都来自真实条目的 ',
    ledePost: ' 字段——不是梗概，不是人设，是一句"你在场时听到了什么"。',
    navAlmanac: '世界藏经阁',
    navAtlas: '寰宇图志',
    navChronicle: '世界编年',
    navConstellation: '角色星图',
    navQuiz: '谜灯馆',
    navAria: '世界子页导航',
    emptyTitle: '还没有被刻下的回声。',
    emptyCopy: '去 Studio 的世界面板，给 story / history 条目写一刻 memory——世界就会在此处低声复述它。',
    eraDefault: '未标纪元',
    kindHistory: '历史',
    kindStory: '故事',
    kindOther: '其它',
  },
  en: {
    kicker: (project) => `MEMORIES · ${project}`,
    title: 'Memory Corridor',
    ledePre: "Echoes carved into the world. Every one comes from a real entry's ",
    ledePost: ' field — not a summary, not a character sheet, but a sentence about what you heard while you were there.',
    navAlmanac: 'Almanac',
    navAtlas: 'Atlas',
    navChronicle: 'Chronicle',
    navConstellation: 'Constellation',
    navQuiz: 'Lantern Trial',
    navAria: 'World section navigation',
    emptyTitle: 'No echoes have been carved yet.',
    emptyCopy: 'In the Studio world panel, write a `memory` on a story or history entry — the world will whisper it back here.',
    eraDefault: 'No era',
    kindHistory: 'History',
    kindStory: 'Story',
    kindOther: 'Other',
  },
};

export default async function MemoriesPage({ params }: { params: Promise<{ projectId: string }> }) {
  const [{ projectId }, locale] = await Promise.all([params, getLocale()]);
  const c = COPY[locale];
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
          kindLabel: n.kind === 'history' ? c.kindHistory : n.kind === 'story' ? c.kindStory : c.kindOther,
          era: (n.lore?.era ?? '').trim() || c.eraDefault,
          order: typeof n.lore?.order === 'number' ? (n.lore!.order as number) : Number.MAX_SAFE_INTEGER,
          memory: n.lore?.memory,
          updatedAt: n.updatedAt,
        }))
        .sort((a, b) => {
          const ea = a.era === c.eraDefault ? '￰' : a.era;
          const eb = b.era === c.eraDefault ? '￰' : b.era;
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
          <p className="mem-kicker">{c.kicker(project.name)}</p>
          <h1 className="mem-title">{c.title}</h1>
          <p className="mem-lede">
            {c.ledePre}<code className="mem-code">memory</code>{c.ledePost}
          </p>
        </div>
        <nav className="world-nav" aria-label={c.navAria}>
          <a href={`/world/${projectId}/almanac`} className="world-navLink">{c.navAlmanac}</a>
          <a href={`/world/${projectId}/atlas`} className="world-navLink">{c.navAtlas}</a>
          <a href={`/world/${projectId}/chronicle`} className="world-navLink">{c.navChronicle}</a>
          <a href={`/world/${projectId}/constellation`} className="world-navLink">{c.navConstellation}</a>
          <a href={`/world/${projectId}/quiz`} className="world-navLink world-navLinkQuiz">{c.navQuiz}</a>
        </nav>
      </header>

      {entries.length === 0 ? (
        <div className="mem-empty" data-memories-empty>
          <p className="mem-emptyTitle">{c.emptyTitle}</p>
          <p className="mem-emptyCopy">{c.emptyCopy}</p>
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
