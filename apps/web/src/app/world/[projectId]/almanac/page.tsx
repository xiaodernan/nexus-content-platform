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
    <main className="min-h-dvh bg-[#05070f] px-6 py-8 text-[#e8e3d3]" data-almanac-root>
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{ background: 'radial-gradient(900px 480px at 12% -8%, rgba(201,168,106,0.14), transparent 55%), radial-gradient(900px 560px at 88% 4%, rgba(91,108,255,0.16), transparent 60%), radial-gradient(700px 600px at 50% 115%, rgba(34,211,238,0.08), transparent 55%)' }}
      />
      <header className="relative mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3">
        <Link href={`/world/${projectId}`} className="font-mono text-10 uppercase tracking-[0.24em] text-[#c9a86a] hover:text-[#e8d5a4]">← 世界步行</Link>
        <p className="font-mono text-10 uppercase tracking-[0.3em] text-[#c9a86a]/70">THE GREAT ARCHIVE · {project.name}</p>
      </header>

      <section className="relative mx-auto mt-10 max-w-6xl">
        <p className="font-mono text-10 uppercase tracking-[0.32em] text-[#c9a86a]">世界藏经阁</p>
        <h1 className="mt-3 text-[64px] font-semibold leading-[1.08] text-[#f0e9d8]" style={{ fontFamily: SERIF }}>
          {worldOk?.name ?? project.name}
        </h1>
        <p className="mt-5 max-w-2xl text-15 leading-8 text-[#b9b29a]">
          {worldOk?.summary?.trim() || '这一卷还没有被写下的卷语——回到 Studio，替它写下第一句。'}
        </p>
        <div className="mt-6 flex flex-wrap gap-x-8 gap-y-2 border-y border-[#c9a86a]/15 py-4 font-mono text-11 text-[#c9a86a]">
          <span>{totalNodes} 条目</span>
          <span>{eras.length} 纪元</span>
          <span>{characters.items.length} 人物</span>
          <span>{memories.length} 道回声</span>
        </div>
        {epigraphs.length > 0 && (
          <blockquote className="mt-6 max-w-3xl border-l-2 border-[#c9a86a]/40 pl-5 text-17 italic leading-9 text-[#d8cfb6]" data-almanac-epigraph>
            {epigraphs[0]!.memory}
            <span className="mt-2 block font-sans text-11 not-italic text-[#8a8266]">—— {epigraphs[0]!.title}</span>
          </blockquote>
        )}
      </section>

      {eras.length > 0 && (
        <section className="relative mx-auto mt-10 max-w-6xl" data-almanac-eras>
          <p className="font-mono text-10 uppercase tracking-[0.28em] text-[#c9a86a]/80">纪元长卷</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {eras.map((e) => (
              <Link
                key={e.era}
                href={`/world/${projectId}/chronicle#era-${encodeURIComponent(e.era)}`}
                data-almanac-era={e.era}
                className="group rounded-full border border-[#c9a86a]/25 bg-[#141109]/60 px-4 py-1.5 text-12 text-[#d8cfb6] transition-colors hover:border-[#c9a86a]/60 hover:text-[#f5edd9]"
              >
                {e.era} <span className="font-mono text-10 text-[#c9a86a]">{e.entries.length}</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="relative mx-auto mt-10 grid max-w-6xl grid-cols-1 gap-4 md:grid-cols-2">
        {doors.map((d) => (
          <Link
            key={d.vol}
            href={d.href}
            data-almanac-door={d.vol}
            className="group relative overflow-hidden rounded-2xl border border-[#c9a86a]/15 bg-gradient-to-br from-[#12100a] to-[#0a0906] p-6 transition-all hover:border-[#c9a86a]/45 hover:from-[#171310] hover:to-[#0d0c07]"
          >
            <div aria-hidden="true" className="pointer-events-none absolute -right-2 -top-4 select-none text-[80px] font-bold leading-none text-[#c9a86a]/10 transition-colors group-hover:text-[#c9a86a]/20" style={{ fontFamily: SERIF }}>
              {d.vol.slice(-1)}
            </div>
            <p className="font-mono text-10 uppercase tracking-[0.3em] text-[#c9a86a]">{d.vol}</p>
            <h2 className="mt-2 text-24 font-semibold text-[#f0e9d8]" style={{ fontFamily: SERIF }}>{d.title}</h2>
            <p className="mt-2 text-13 leading-6 text-[#a89f85]">{d.note}</p>
            <p className="mt-4 inline-flex items-center gap-2 font-mono text-11 text-[#c9a86a]">{d.count}<span aria-hidden="true">→</span></p>
          </Link>
        ))}
      </section>

      <section className="relative mx-auto mt-10 max-w-6xl rounded-2xl border border-[#c9a86a]/12 bg-[#0d0c07]/70 p-6" data-almanac-kinds>
        <p className="font-mono text-10 uppercase tracking-[0.28em] text-[#c9a86a]/80">世界九造 · 条目普查</p>
        <div className="mt-4 grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
          {KIND_ORDER.map((k) => {
            const count = countByKind.get(k) ?? 0;
            return (
              <div key={k} className="flex items-center gap-3" data-almanac-kind-row={k}>
                <span className="w-8 shrink-0 font-mono text-11 text-[#c9a86a]">{WORLD_KIND_LABELS[k]}</span>
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[#221f14]">
                  <div className="h-full rounded-full bg-gradient-to-r from-[#8a6f3a] to-[#e8d5a4]" style={{ width: `${(count / maxKind) * 100}%` }} />
                </div>
                <span className="w-6 text-right font-mono text-11 text-[#d8cfb6]">{count}</span>
              </div>
            );
          })}
        </div>
        <p className="mt-6 border-t border-[#c9a86a]/12 pt-4 font-mono text-10 leading-5 text-[#8a8266]">
          本页由世界文档直接投影，不落任何字节。{characters.unreadable.length > 0 ? `有 ${characters.unreadable.length} 位人物读不出（档案损坏，名单不凑数）。` : ''}纪元顺序按编年同一口径；未建条目不计入。
        </p>
      </section>
    </main>
  );
}
