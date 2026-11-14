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
    <main className="min-h-dvh bg-[#070a14] px-6 py-10 text-[#e8eaed]" data-memories-root>
      <header className="mx-auto flex max-w-3xl flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-mono text-10 uppercase tracking-[0.22em] text-[#8b95ff]">MEMORIES · {project.name}</p>
          <h1 className="mt-2 text-[var(--nexus-font-size-34)] font-bold leading-tight text-[#eef0ff]">记忆回廊</h1>
          <p className="mt-3 text-14 leading-6 text-[#aab2d8]">
            世界里被刻下来的回声。每一条都来自真实条目的 <code className="rounded bg-[#111737] px-1 font-mono text-10 text-[#a8e3ff]">memory</code> 字段——不是梗概，不是人设，是一句"你在场时听到了什么"。
          </p>
        </div>
        <nav className="flex flex-wrap items-center gap-2" aria-label="世界子页导航">
          <a href={`/world/${projectId}/almanac`} className="rounded-md border border-[#232b52] bg-[#0d1230]/70 px-3 py-1.5 text-11 text-[#c6cdf5] transition-colors hover:border-[#3a4472] hover:text-white">世界藏经阁</a>
          <a href={`/world/${projectId}/atlas`} className="rounded-md border border-[#232b52] bg-[#0d1230]/70 px-3 py-1.5 text-11 text-[#c6cdf5] transition-colors hover:border-[#3a4472] hover:text-white">寰宇图志</a>
          <a href={`/world/${projectId}/chronicle`} className="rounded-md border border-[#232b52] bg-[#0d1230]/70 px-3 py-1.5 text-11 text-[#c6cdf5] transition-colors hover:border-[#3a4472] hover:text-white">世界编年</a>
          <a href={`/world/${projectId}/constellation`} className="rounded-md border border-[#232b52] bg-[#0d1230]/70 px-3 py-1.5 text-11 text-[#c6cdf5] transition-colors hover:border-[#3a4472] hover:text-white">角色星图</a>
        </nav>
      </header>

      {entries.length === 0 ? (
        <div className="mx-auto mt-10 max-w-3xl rounded-xl border border-[#1e2647] bg-[#0d1230]/60 p-8 text-center" data-memories-empty>
          <p className="text-16 text-[#d6dbf5]">还没有被刻下的回声。</p>
          <p className="mt-2 text-13 text-[#8b95ff]/70">去 Studio 的世界面板，给 story / history 条目写一刻 memory——世界就会在此处低声复述它。</p>
        </div>
      ) : (
        <ol className="mx-auto mt-10 flex max-w-3xl flex-col gap-6">
          {entries.map((entry) => (
            <li
              key={entry.id}
              className="group relative rounded-xl border border-[#1e2647] bg-[#0d1230]/80 p-5 pl-6 transition-colors hover:border-[#3a4472]"
              data-memories-entry={entry.id}
            >
              <span
                aria-hidden="true"
                className="absolute left-0 top-5 h-[calc(100%-2.5rem)] w-1 rounded-r bg-gradient-to-b from-[#5b6cff] via-[#8b95ff] to-[#22d3ee]"
              />
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div className="flex flex-wrap items-baseline gap-3">
                  <span className="font-mono text-10 uppercase tracking-[0.18em] text-[#8b95ff]" data-memories-era>{entry.era}</span>
                  <span className="font-mono text-10 text-[#22d3ee]/70" data-memories-kind>{entry.kindLabel}</span>
                </div>
                <time className="font-mono text-10 text-[#8b95ff]/60" dateTime={entry.updatedAt}>{entry.updatedAt.slice(0, 10)}</time>
              </div>
              <p className="mt-2 text-16 font-medium leading-7 text-[#eef0ff]">{entry.title}</p>
              {entry.memory ? (
                <blockquote className="mt-3 border-l-2 border-[#5b6cff]/40 pl-4 text-15 italic leading-7 text-[#dde2ff]" data-memories-quote>“{entry.memory}”</blockquote>
              ) : null}
            </li>
          ))}
        </ol>
      )}
    </main>
  );
}
