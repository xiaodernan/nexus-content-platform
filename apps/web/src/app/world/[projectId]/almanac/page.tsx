import Link from 'next/link';
import { notFound } from 'next/navigation';
import { loadWorld } from '@/server/domain/worlds';
import { loadDocument } from '@/server/domain/projects';
import { projectVisibleTo } from '@/server/domain/team';
import { requireUser } from '@/server/domain/session';
import { listCharacters } from '@/server/domain/characters';
import { WORLD_KIND_LABELS, type WorldKind } from '@nexus/world-model';
import { buildChronicle, type ChronicleNodeInput } from '@/lib/chronicle';
import { buildQuiz, seedFromString, type QuizNodeInput } from '@/lib/quiz';

export const dynamic = 'force-dynamic';

/**
 * 「世界藏经阁」v711 —— 世界子系统的卷首与目录。
 * 与步行 / 星图 / 编年 / 回廊 / 图志是同一纪律：零写库、读不到就说读不到。
 * 本页是「走进去之前先看一眼殿门」的地方——宏观的史诗目录，细节交给各卷。
 */
const SERIF = "'Noto Serif SC', 'Source Han Serif SC', 'Songti SC', 'STSong', Georgia, 'Times New Roman', serif";

export default async function AlmanacPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
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

  const doors: Array<{ vol: string; title: string; href: string; count: string; note: string }> = [
    { vol: '卷一', title: '世界编年', href: `/world/${projectId}/chronicle`, count: `${storyHistory} 条目`, note: '纪元之轴上，每一次燃与灭都按时间排着' },
    { vol: '卷二', title: '寰宇图志', href: `/world/${projectId}/atlas`, count: `${spaceCount} 座星位`, note: '地理与势力在夜图上星火对峙（黄金角排布）' },
    { vol: '卷三', title: '记忆回廊', href: `/world/${projectId}/memories`, count: `${memories.length} 道回声`, note: '每一条都是"你在场时听到了什么"' },
    { vol: '卷四', title: '角色星图', href: `/world/${projectId}/constellation`, count: `${characters.items.length} 位人物`, note: '全档人物与骨架节点，一张可以步行的星图' },
    { vol: '卷五', title: '谜灯馆', href: `/world/${projectId}/quiz`, count: `${quizRounds} 盏灯`, note: '凭记忆为这座世界点灯——题面全出自世界文档' },
  ];

  return (
    <main className="alm-root" data-almanac-root>
      <div
        aria-hidden="true"
        className="alm-glow"
        style={{ background: 'radial-gradient(900px 480px at 12% -8%, rgba(201,168,106,0.14), transparent 55%), radial-gradient(900px 560px at 88% 4%, rgba(91,108,255,0.16), transparent 60%), radial-gradient(700px 600px at 50% 115%, rgba(34,211,238,0.08), transparent 55%)' }}
      />
      <header className="alm-head">
        <Link href={`/world/${projectId}`} className="alm-backlink">← 世界步行</Link>
        <p className="alm-eyebrow">THE GREAT ARCHIVE · {project.name}</p>
      </header>

      <section className="alm-section">
        <p className="alm-eyebrow">世界藏经阁</p>
        <h1 className="alm-title" style={{ fontFamily: SERIF }}>
          {worldOk?.name ?? project.name}
        </h1>
        <p className="alm-lede">
          {worldOk?.summary?.trim() || '这一卷还没有被写下的卷语——回到 Studio，替它写下第一句。'}
        </p>
        <div className="alm-strip">
          <span>{totalNodes} 条目</span>
          <span>{eras.length} 纪元</span>
          <span>{characters.items.length} 人物</span>
          <span>{memories.length} 道回声</span>
        </div>
        {epigraphs.length > 0 && (
          <blockquote className="alm-epigraph" data-almanac-epigraph>
            {epigraphs[0]!.memory}
            <span className="alm-epigraphSource">—— {epigraphs[0]!.title}</span>
          </blockquote>
        )}
      </section>

      {eras.length > 0 && (
        <section className="alm-section" data-almanac-eras>
          <p className="alm-eyebrow">纪元长卷</p>
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
        <p className="alm-eyebrow">世界九造 · 条目普查</p>
        <div className="alm-kindGrid">
          {KIND_ORDER.map((k) => {
            const count = countByKind.get(k) ?? 0;
            return (
              <div key={k} className="alm-kindRow" data-almanac-kind-row={k}>
                <span className="alm-kindLabel">{WORLD_KIND_LABELS[k]}</span>
                <div className="alm-kindTrack">
                  <div className="alm-kindFill" style={{ width: `${(count / maxKind) * 100}%` }} />
                </div>
                <span className="alm-kindCount">{count}</span>
              </div>
            );
          })}
        </div>
        <p className="alm-footnote">
          本页由世界文档直接投影，不落任何字节。{characters.unreadable.length > 0 ? `有 ${characters.unreadable.length} 位人物读不出（档案损坏，名单不凑数）。` : ''}纪元顺序按编年同一口径；未建条目不计入。
        </p>
      </section>
    </main>
  );
}
