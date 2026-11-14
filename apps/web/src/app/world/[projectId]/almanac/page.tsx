import Link from 'next/link';
import { notFound } from 'next/navigation';
import { loadWorld } from '@/server/domain/worlds';
import { loadDocument } from '@/server/domain/projects';
import { projectVisibleTo } from '@/server/domain/team';
import { requireUser } from '@/server/domain/session';
import { listCharacters } from '@/server/domain/characters';
import { WORLD_KIND_LABELS, type WorldKind } from '@nexus/world-model';
import { getLocale, type Locale } from '@/lib/i18n';
import { buildChronicle, type ChronicleNodeInput } from '@/lib/chronicle';
import { buildQuiz, seedFromString, type QuizNodeInput } from '@/lib/quiz';

export const dynamic = 'force-dynamic';

/**
 * 「世界藏经阁」v711 —— 世界子系统的卷首与目录。
 * 与步行 / 星图 / 编年 / 回廊 / 图志是同一纪律：零写库、读不到就说读不到。
 * 本页是「走进去之前先看一眼殿门」的地方——宏观的史诗目录，细节交给各卷。
 * 全站双语（v733）：COPY 中英一辞两字面，locale 由 getLocale() 读，不夹杂。
 */
const SERIF = "'Noto Serif SC', 'Source Han Serif SC', 'Songti SC', 'STSong', Georgia, 'Times New Roman', serif";

const EN_KIND_LABELS: Record<WorldKind, string> = {
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

interface DoorCopy { vol: string; title: string; href: string; count: string; note: string }

const COPY: Record<Locale, {
  backlink: string;
  eyebrowArchive: string;
  almanacKicker: string;
  ledeFallback: string;
  entries: (n: number) => string;
  eras: (n: number) => string;
  characters: (n: number) => string;
  echoes: (n: number) => string;
  erasRibbon: string;
  epigraphSource: (title: string) => string;
  doors: (projectId: string, storyHistory: number, spaceCount: number, echoes: number, characters: number, lanterns: number) => DoorCopy[];
  censusTitle: string;
  kindLabels: Record<WorldKind, string>;
  footnote: (unreadable: number) => string;
}> = {
  zh: {
    backlink: '← 世界步行',
    eyebrowArchive: 'THE GREAT ARCHIVE',
    almanacKicker: '世界藏经阁',
    ledeFallback: '这一卷还没有被写下的卷语——回到 Studio，替它写下第一句。',
    entries: (n) => `${n} 条目`,
    eras: (n) => `${n} 纪元`,
    characters: (n) => `${n} 人物`,
    echoes: (n) => `${n} 道回声`,
    erasRibbon: '纪元长卷',
    epigraphSource: (title) => `—— ${title}`,
    doors: (projectId, storyHistory, spaceCount, echoes, characters, lanterns) => [
      { vol: '卷一', title: '世界编年', href: `/world/${projectId}/chronicle`, count: `${storyHistory} 条目`, note: '纪元之轴上，每一次燃与灭都按时间排着' },
      { vol: '卷二', title: '寰宇图志', href: `/world/${projectId}/atlas`, count: `${spaceCount} 座星位`, note: '地理与势力在夜图上星火对峙（黄金角排布）' },
      { vol: '卷三', title: '记忆回廊', href: `/world/${projectId}/memories`, count: `${echoes} 道回声`, note: '每一条都是"你在场时听到了什么"' },
      { vol: '卷四', title: '角色星图', href: `/world/${projectId}/constellation`, count: `${characters} 位人物`, note: '全档人物与骨架节点，一张可以步行的星图' },
      { vol: '卷五', title: '谜灯馆', href: `/world/${projectId}/quiz`, count: `${lanterns} 盏灯`, note: '凭记忆为这座世界点灯——题面全出自世界文档' },
    ],
    censusTitle: '世界九造 · 条目普查',
    kindLabels: WORLD_KIND_LABELS,
    footnote: (unreadable) => `本页由世界文档直接投影，不落任何字节。${unreadable > 0 ? `有 ${unreadable} 位人物读不出（档案损坏，名单不凑数）。` : ''}纪元顺序按编年同一口径；未建条目不计入。`,
  },
  en: {
    backlink: '← World Walk',
    eyebrowArchive: 'THE GREAT ARCHIVE',
    almanacKicker: 'The Great Archive',
    ledeFallback: 'No preface has been written for this volume yet — return to Studio and write the first line.',
    entries: (n) => `${n} entries`,
    eras: (n) => `${n} eras`,
    characters: (n) => `${n} characters`,
    echoes: (n) => `${n} echoes`,
    erasRibbon: 'The Era Ribbon',
    epigraphSource: (title) => `—— ${title}`,
    doors: (projectId, storyHistory, spaceCount, echoes, characters, lanterns) => [
      { vol: 'VOL. I', title: 'The World Chronicle', href: `/world/${projectId}/chronicle`, count: `${storyHistory} entries`, note: 'On the axis of ages, every burning and every dying, in order' },
      { vol: 'VOL. II', title: 'The Atlas', href: `/world/${projectId}/atlas`, count: `${spaceCount} pins`, note: 'Geography and factions on a night map (golden-angle spiral)' },
      { vol: 'VOL. III', title: 'The Memory Corridor', href: `/world/${projectId}/memories`, count: `${echoes} echoes`, note: 'Each one is "what you heard when you were there"' },
      { vol: 'VOL. IV', title: 'The Constellation', href: `/world/${projectId}/constellation`, count: `${characters} characters`, note: 'The full roster on one walkable star chart' },
      { vol: 'VOL. V', title: 'The Lantern Trial', href: `/world/${projectId}/quiz`, count: `${lanterns} lanterns`, note: 'Light this world by memory — every question comes from the document' },
    ],
    censusTitle: 'The Nine Factions · Entry Census',
    kindLabels: EN_KIND_LABELS,
    footnote: (unreadable) => `This page is a pure projection of the world document — nothing is written here.${unreadable > 0 ? ` ${unreadable} character roster(s) could not be read (corrupt records; the list was not padded to compensate).` : ''} Era order follows the same rule as the Chronicle; entries without records are not counted.`,
  },
};

export default async function AlmanacPage({ params }: { params: Promise<{ projectId: string }> }) {
  const [{ projectId }, locale] = await Promise.all([params, getLocale()]);
  const c = COPY[locale];
  const user = await requireUser();
  if (!(await projectVisibleTo(projectId, user.id))) notFound();

  const [world, project, characters] = await Promise.all([
    loadWorld(projectId),
    loadDocument(projectId),
    listCharacters(projectId).catch(() => ({ items: [], unreadable: ['roster-unavailable'] })),
  ]);
  if (!project) notFound();

  const worldOk = world && world.ok ? world.document : null;
  const nodes = worldOk?.nodes ?? [];

  const countByKind = new Map<string, number>();
  for (const n of nodes) countByKind.set(n.kind, (countByKind.get(n.kind) ?? 0) + 1);

  const chronicleInput: ChronicleNodeInput[] = nodes.map((n) => ({
    id: n.id,
    kind: n.kind as string,
    title: typeof n.title === 'string' ? n.title : '',
    updatedAt: typeof n.updatedAt === 'string' ? n.updatedAt : '',
    lore: n.lore,
  }));
  const quizInput: QuizNodeInput[] = nodes.map((n) => ({
    id: n.id,
    kind: n.kind as string,
    title: typeof n.title === 'string' ? n.title.trim() : '',
    body: typeof n.body === 'string' ? n.body.trim() : '',
    updatedAt: typeof n.updatedAt === 'string' ? n.updatedAt : '',
    lore: n.lore,
  }));
  const quizSeed = seedFromString(worldOk?.id ?? projectId) ^ 0x1e3779b9;
  const quizRounds = buildQuiz(quizInput, quizSeed >>> 0).length;
  const eras = buildChronicle(chronicleInput);
  const storyHistory = eras.reduce((acc, e) => acc + e.entries.length, 0);
  const spaceCount = (countByKind.get('geography') ?? 0) + (countByKind.get('factions') ?? 0);
  const memories = nodes
    .filter((n) => typeof n.lore?.memory === 'string' && n.lore.memory!.trim().length > 0)
    .map((n) => ({ title: n.title, memory: n.lore!.memory!.trim(), era: n.lore?.era ?? '' }))
    .sort((a, b) => b.memory.length - a.memory.length);
  const epigraphs = memories.slice(0, 2);
  const totalNodes = nodes.length;
  const KIND_ORDER: WorldKind[] = ['lore', 'history', 'geography', 'factions', 'characters', 'creatures', 'items', 'quests', 'story'];
  const maxKind = Math.max(1, ...KIND_ORDER.map((k) => countByKind.get(k) ?? 0));

  const doors = c.doors(projectId, storyHistory, spaceCount, memories.length, characters.items.length, quizRounds);

  return (
    <main className="alm-root" data-almanac-root>
      <div
        aria-hidden="true"
        className="alm-glow"
        style={{ background: 'radial-gradient(900px 480px at 12% -8%, rgba(201,168,106,0.14), transparent 55%), radial-gradient(900px 560px at 88% 4%, rgba(91,108,255,0.16), transparent 60%), radial-gradient(700px 600px at 50% 115%, rgba(34,211,238,0.08), transparent 55%)' }}
      />
      <header className="alm-head">
        <Link href={`/world/${projectId}`} className="alm-backlink">{c.backlink}</Link>
        <p className="alm-eyebrow">{c.eyebrowArchive} · {project.name}</p>
      </header>

      <section className="alm-section">
        <p className="alm-eyebrow">{c.almanacKicker}</p>
        <h1 className="alm-title" style={{ fontFamily: SERIF }}>
          {worldOk?.name ?? project.name}
        </h1>
        <p className="alm-lede">
          {worldOk?.summary?.trim() || c.ledeFallback}
        </p>
        <div className="alm-strip">
          <span>{c.entries(totalNodes)}</span>
          <span>{c.eras(eras.length)}</span>
          <span>{c.characters(characters.items.length)}</span>
          <span>{c.echoes(memories.length)}</span>
        </div>
        {epigraphs.length > 0 && (
          <blockquote className="alm-epigraph" data-almanac-epigraph>
            {epigraphs[0]!.memory}
            <span className="alm-epigraphSource">{c.epigraphSource(epigraphs[0]!.title)}</span>
          </blockquote>
        )}
      </section>

      {eras.length > 0 && (
        <section className="alm-section" data-almanac-eras>
          <p className="alm-eyebrow">{c.erasRibbon}</p>
          <div className="alm-eraRow">
            {eras.map((e) => (
              <Link
                key={e.era}
                href={`/world/${projectId}/chronicle#era-${encodeURIComponent(e.era)}`}
                data-almanac-era={e.era}
                className="alm-eraChip"
              >
                {e.era} <span className="alm-eraCount">{e.entries.length}</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="alm-doors">
        {doors.map((d) => (
          <Link
            key={d.vol}
            href={d.href}
            data-almanac-door={d.vol}
            className="alm-door"
          >
            <div aria-hidden="true" className="alm-doorGlyph" style={{ fontFamily: SERIF }}>
              {d.vol.slice(-1)}
            </div>
            <p className="alm-eyebrow">{d.vol}</p>
            <h2 className="alm-doorTitle" style={{ fontFamily: SERIF }}>{d.title}</h2>
            <p className="alm-doorNote">{d.note}</p>
            <p className="alm-doorCount">{d.count}<span aria-hidden="true">→</span></p>
          </Link>
        ))}
      </section>

      <section className="alm-census" data-almanac-kinds>
        <p className="alm-eyebrow">{c.censusTitle}</p>
        <div className="alm-kindGrid">
          {KIND_ORDER.map((k) => {
            const count = countByKind.get(k) ?? 0;
            return (
              <div key={k} className="alm-kindRow" data-almanac-kind-row={k}>
                <span className="alm-kindLabel">{c.kindLabels[k]}</span>
                <div className="alm-kindTrack">
                  <div className="alm-kindFill" style={{ width: `${(count / maxKind) * 100}%` }} />
                </div>
                <span className="alm-kindCount">{count}</span>
              </div>
            );
          })}
        </div>
        <p className="alm-footnote">{c.footnote(characters.unreadable.length)}</p>
      </section>
    </main>
  );
}
