'use client';

import Link from 'next/link';
import type { ChronicleEra, ChronicleEntry } from '@/lib/chronicle';
import { eraProgress } from '@/lib/chronicle';
import type { EraTie } from '@/lib/era-ties';

/**
 * 「世界编年」—— 世界文献的投影，全部从真实节点读。
 * 边界（诚实）：本组件纯渲染、零 provider、不做传递推断；locale 上层 RSC 传入、绝不机翻。
 * 中英双语（v724）：locale 由上层 RSC 读 cookie 传入，COPY 双语字典，中英一套两字面、不夹带。
 */

interface PresentCharacter {
  id: string;
  name: string;
  activeEra?: string;
}

const COPY = {
  zh: {
    emptyTitle: '编年册还是空白',
    emptyCopy: (name: string) => `「${name}」的世界文档里还没有 story / history 条目。去 Studio 的世界面板写一段历史——哪怕一行——编年册就会长出第一个纶元。`,
    kicker: 'CHRONICLE',
    title: '世界编年',
    eraUnit: '个纶元',
    entryUnit: '条编年',
    ariaScroll: '世界编年（可横向滚动）',
    ariaEra: (name: string) => `纶元：${name}`,
    eraCount: (n: number) => `${n} 条编年`,
    tiesLabel: '本卷活跃的星图人物',
    tiesEmpty: '星图里还没有人物指向本卷的条目——在人物关系页给任意角色加一条「指向世界条目」的关系，这里就会亮起来。',
    tiesAria: (name: string) => `星图与本卷相连的人物 · ${name}`,
    tieTitle: (n: number) => `与本卷 ${n} 条编年相连`,
    footnote: '只有 story / history 进编年 · era 是作者写的字面，不是算法给的"历史感" · 顺序按 lore.order（缺省 updatedAt）· 本页零写库',
  },
  en: {
    emptyTitle: 'The chronicle is still blank',
    emptyCopy: (name: string) => `「${name}」’s world document has no story / history entries yet. Write one line of history in the Studio world panel — even a single line — and the chronicle grows its first era.`,
    kicker: 'CHRONICLE',
    title: 'World chronicle',
    eraUnit: 'era(s)',
    entryUnit: 'entry(ies)',
    ariaScroll: 'World chronicle (horizontal scroll)',
    ariaEra: (name: string) => `Era: ${name}`,
    eraCount: (n: number) => `${n} entry(ies)`,
    tiesLabel: 'Figures live in this era',
    tiesEmpty: 'No figure points at any entry in this era yet — add one “point to world entry” relationship in the character panel and this lights up.',
    tiesAria: (name: string) => `Figures tied to this era · ${name}`,
    tieTitle: (n: number) => `${n} entry(ies) in this era linked`,
    footnote: 'Only story / history entries enter the chronicle · era is the author’s wording, not an algorithm’s “sense of history” · order by lore.order (default updatedAt) · zero writes',
  },
} as const;

export function ChronicleView({
  worldName,
  projectId,
  eras,
  ties,
  characters = [],
  locale = 'zh',
}: {
  worldName: string;
  projectId: string;
  eras: ChronicleEra[];
  ties?: EraTie[];
  characters?: ReadonlyArray<PresentCharacter>;
  locale?: 'zh' | 'en';
}) {
  const c = COPY[locale];
  const total = eras.reduce((a, e) => a + e.entries.length, 0);

  if (total === 0) {
    return (
      <main className="crn-empty" data-chronicle-empty>
        <svg viewBox="0 0 48 48" width="56" height="56" fill="none" aria-hidden="true">
          <rect x="8" y="6" width="32" height="36" rx="3" stroke="var(--nexus-color-brand)" strokeWidth="1.6" />
          <path d="M16 14h16M16 22h16M16 30h10" stroke="var(--nexus-color-accent-mix)" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
        <h1 className="crn-emptyTitle">{c.emptyTitle}</h1>
        <p className="crn-emptyCopy">{c.emptyCopy(worldName)}</p>
      </main>
    );
  }

  return (
    <main className="crn-root" data-chronicle-root>
      <header className="crn-head">
        <div>
          <p className="crn-kicker" data-chronicle-kicker>{c.kicker} · {worldName}</p>
          <h1 className="crn-title">{c.title}</h1>
        </div>
        <div className="crn-headCounts" data-chronicle-counts>
          <span>{eras.length} {c.eraUnit}</span>
          <span aria-hidden="true" className="crn-headDot">·</span>
          <span>{total} {c.entryUnit}</span>
        </div>
      </header>

      {/* 横向编年 */}
      <div className="crn-scroll" role="region" aria-label={c.ariaScroll} tabIndex={0} data-chronicle-scroll>
        {eras.map((era, eraIndex) => (
          <section
            key={`${era.era}-${eraIndex}`}
            className="crn-era"
            data-chronicle-era={era.era}
            aria-label={c.ariaEra(era.era)}
          >
            {/* 纶元背景光晕 */}
            <div
              aria-hidden="true"
              className="crn-eraGlow"
              style={{ background: `radial-gradient(ellipse 90% 60% at ${20 + (eraIndex * 13) % 60}% 12%, color-mix(in srgb, var(--nexus-color-brand) ${16 + (eraIndex % 3) * 6}%, transparent) 0%, transparent 65%)` }}
            />
            <div className="crn-eraHead">
              <p className="crn-eraTag">ERA {String(eraIndex + 1).padStart(2, '0')}</p>
              <h2 className="crn-eraTitle">{era.era}</h2>
              <p className="crn-eraCount">{c.eraCount(era.entries.length)}</p>
            </div>
            <EraTiesStrip ties={ties} eraIndex={eraIndex} era={era.era} projectId={projectId} locale={locale} />
            <ol className="crn-list">
              {era.entries.map((entry, i) => (
                <ChronicleCard key={entry.id} entry={entry} eraIndex={eraIndex} entryIndex={i} eras={eras} characters={characters} projectId={projectId} locale={locale} />
              ))}
            </ol>
          </section>
        ))}
      </div>

      <footer className="crn-footnote" data-chronicle-footnote>{c.footnote}</footer>
    </main>
  );
}

function EraTiesStrip({ ties, eraIndex, era, projectId, locale }: { ties?: EraTie[]; eraIndex: number; era: string; projectId: string; locale: 'zh' | 'en' }) {
  const c = COPY[locale];
  if (!ties) return null;
  // 首选按位（chronicle 与 ties 同序）；降级按卷名匹配，防脏数据串卷
  const tie = ties[eraIndex]?.era === era ? ties[eraIndex]! : ties.find((t) => t.era === era);
  if (!tie) return null;
  const figures = tie.linkedCharacters;
  return (
    <div className="crn-ties" data-chronicle-ties={tie.era} aria-label={c.tiesAria(tie.era)}>
      {figures.length === 0 ? (
        <span className="crn-tiesEmpty" data-chronicle-ties-empty>{c.tiesEmpty}</span>
      ) : (
        <>
          <span className="crn-tiesLabel">{c.tiesLabel}</span>
          {figures.map((fig) => (
            <Link
              key={fig.id}
              href={`/world/${projectId}/constellation`}
              className="crn-tie"
              data-chronicle-tie={fig.id}
              title={c.tieTitle(fig.viaEntryIds.length)}
            >
              {fig.name}
            </Link>
          ))}
        </>
      )}
    </div>
  );
}

function ChronicleCard({ entry, eraIndex, entryIndex, eras, characters, projectId, locale }: { entry: ChronicleEntry; eraIndex: number; entryIndex: number; eras: ChronicleEra[]; characters?: ReadonlyArray<PresentCharacter>; projectId?: string; locale: 'zh' | 'en' }) {
  const c = COPY[locale];
  const progress = eraProgress(eras, eraIndex, entryIndex);
  const kindClass = entry.kind === 'history' ? 'crn-kindTag crn-kindTagHistory' : 'crn-kindTag';
  const presentCharacters = characters?.filter((ch) => ch.activeEra && ch.activeEra === entry.era) ?? [];
  return (
    <li
      className="crn-card"
      data-chronicle-entry={entry.id}
    >
      <div className="crn-cardHead">
        <span className={kindClass} data-chronicle-kind>{entry.kindLabel}</span>
        {progress ? (
          <span className="crn-seq" data-chronicle-seq>{progress.current}/{progress.total}</span>
        ) : null}
      </div>
      {presentCharacters.length > 0 ? (
        <div className="crn-present" data-chronicle-present>
          {presentCharacters.map((character) => (
            <Link
              key={character.id}
              href={`/world/${projectId}/constellation?character=${character.id}`}
              className="crn-presentLink"
              data-chronicle-character={character.id}
              title={c.tiesLabel}
            >
              <span aria-hidden="true" className="crn-presentDot" />
              {character.name}
            </Link>
          ))}
        </div>
      ) : null}
      <p className="crn-titleRow">{entry.title}</p>
      {entry.memory ? (
        <p className="crn-memory" data-chronicle-memory>{entry.memory}</p>
      ) : null}
      <time className="crn-time" dateTime={entry.updatedAt}>
        {entry.updatedAt.slice(0, 10)}
      </time>
    </li>
  );
}
