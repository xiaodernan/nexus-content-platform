'use client';

import type { ChronicleEra, ChronicleEntry } from '@/lib/chronicle';
import { eraProgress } from '@/lib/chronicle';

/**
 * 「世界编年」（v705 / ROADMAP）—— 从世界文档的 story/history 推导的年表视图。
 *
 * 诚实边界（同星图）：这是投影，不写库；story/history 才进编年；era 只是文字，没有硬模型——
 * 档位是作者自己写的，不是算法给的"历史感"。
 */
export function ChronicleView({ worldName, eras, characters = [], projectId = '' }: { worldName: string; eras: ChronicleEra[]; characters?: ReadonlyArray<{ id: string; name: string; activeEra?: string }>; projectId?: string }) {
  const total = eras.reduce((a, e) => a + e.entries.length, 0);
  if (total === 0) {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-[#070a14] px-6 text-center text-[#e8eaed]" data-chronicle-empty>
        <svg viewBox="0 0 48 48" width="56" height="56" fill="none" aria-hidden="true">
          <rect x="8" y="6" width="32" height="36" rx="3" stroke="#5b6cff" strokeWidth="1.6" />
          <path d="M16 14h16M16 22h16M16 30h10" stroke="#8b95ff" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
        <h1 className="text-[var(--nexus-font-size-21)] font-semibold">年表还是空白</h1>
        <p className="max-w-md text-13 leading-6 text-[#aab2d8]">
          「{worldName}」的世界文档里还没有 story / history 条目。去 Studio 的世界面板写一段历史——哪怕一行——年表就会长出第一个纪元。
        </p>
      </main>
    );
  }

  return (
    <main className="flex h-dvh flex-col overflow-hidden bg-[#070a14] text-[#e8eaed]" data-chronicle-root>
      <header className="flex flex-wrap items-baseline justify-between gap-3 border-b border-[#151b3a] px-6 py-4">
        <div>
          <p className="font-mono text-10 uppercase tracking-[0.22em] text-[#8b95ff]" data-chronicle-kicker>CHRONICLE · {worldName}</p>
          <h1 className="text-[var(--nexus-font-size-21)] font-semibold">世界编年</h1>
        </div>
        <div className="flex items-center gap-3 font-mono text-11 text-[#aab2d8]" data-chronicle-counts>
          <span>{eras.length} 个纪元</span>
          <span className="text-[#5b6cff]">·</span>
          <span>{total} 条编年</span>
        </div>
      </header>

      {/* 横向年表 */}
      <div className="flex min-h-0 flex-1 overflow-x-auto overflow-y-hidden" role="region" aria-label="世界编年（可横向滚动）" tabIndex={0} data-chronicle-scroll>
        {eras.map((era, eraIndex) => (
          <section
            key={`${era.era}-${eraIndex}`}
            className="relative flex w-[340px] shrink-0 flex-col border-r border-[#151b3a] px-5 py-5"
            data-chronicle-era={era.era}
            aria-label={`纪元：${era.era}`}
          >
            {/* 纪元背景光 */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0"
              style={{ background: `radial-gradient(ellipse 90% 60% at ${20 + (eraIndex * 13) % 60}% 12%, rgba(91,108,255,${0.16 + (eraIndex % 3) * 0.05}) 0%, transparent 65%)` }}
            />
            <div className="relative mb-4">
              <p className="font-mono text-10 uppercase tracking-[0.2em] text-[#8b95ff]">ERA {String(eraIndex + 1).padStart(2, '0')}</p>
              <h2 className="mt-1 text-20 font-bold leading-tight text-[#eef0ff]">{era.era}</h2>
              <p className="mt-1 text-10 text-[#aab2d8]">{era.entries.length} 条编年</p>
            </div>
            <ol className="relative flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto pr-1">
              {era.entries.map((entry, i) => (
                <ChronicleCard key={entry.id} entry={entry} eraIndex={eraIndex} entryIndex={i} eras={eras} characters={characters} projectId={projectId} />
              ))}
            </ol>
          </section>
        ))}
      </div>

      <footer className="border-t border-[#151b3a] px-6 py-2 font-mono text-10 text-[#8b95ff]/70" data-chronicle-footnote>
        只有 story / history 进编年 · era 是作者写的字，不是算法给的"历史感" · 顺序按 lore.order（缺省 updatedAt）· 本页零写库
      </footer>
    </main>
  );
}

function ChronicleCard({ entry, eraIndex, entryIndex, eras, characters, projectId }: { entry: ChronicleEntry; eraIndex: number; entryIndex: number; eras: ChronicleEra[]; characters?: ReadonlyArray<{ id: string; name: string; activeEra?: string }>; projectId?: string }) {
  const progress = eraProgress(eras, eraIndex, entryIndex);
  const presentCharacters = characters?.filter((c) => c.activeEra && c.activeEra === entry.era) ?? [];
  const kindColor = entry.kind === 'history' ? 'text-[#c9a227] border-[#c9a227]/35' : 'text-[#e8eaed] border-[#5b6cff]/35';
  return (
    <li
      className="group rounded-lg border border-[#1e2647] bg-[#0d1230]/80 p-3 transition-colors hover:border-[#3a4472] hover:bg-[#121737]"
      data-chronicle-entry={entry.id}
    >
      <div className="flex items-center justify-between gap-2">
        <span className={`inline-flex items-center rounded border px-1.5 py-0.5 text-10 ${kindColor}`} data-chronicle-kind>{entry.kindLabel}</span>
        {progress ? (
          <span className="font-mono text-10 tabular-nums text-[#8b95ff]" data-chronicle-seq>{progress.current}/{progress.total}</span>
        ) : null}
      </div>
      {presentCharacters.length > 0 ? (
        <div className="mt-1.5 flex flex-wrap gap-1" data-chronicle-present>
          {presentCharacters.map((c) => (
            <a key={c.id} href={`/world/${projectId}/constellation?character=${c.id}`} className="inline-flex items-center gap-1 rounded-full border border-[#26315e] bg-[#101732] px-1.5 py-0.5 text-10 text-[#8b95ff] hover:border-[#3a4472]" data-chronicle-character={c.id}>
              <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-[#5b6cff]" />
              {c.name}
            </a>
          ))}
        </div>
      ) : null}
      <p className="mt-1.5 text-13 font-medium leading-5 text-[#eef0ff]">{entry.title}</p>
      {entry.memory ? (
        <p className="mt-1 border-l-2 border-[#5b6cff]/40 pl-2 text-11 italic leading-4 text-[#b9bef0]" data-chronicle-memory>{entry.memory}</p>
      ) : null}
      <time className="mt-1 block font-mono text-10 text-[#8b95ff]/60" dateTime={entry.updatedAt}>
        {entry.updatedAt.slice(0, 10)}
      </time>
    </li>
  );
}
