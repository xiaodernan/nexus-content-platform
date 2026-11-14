'use client';

import Link from 'next/link';
import type { ChronicleEra, ChronicleEntry } from '@/lib/chronicle';
import { eraProgress } from '@/lib/chronicle';
import type { EraTie } from '@/lib/era-ties';

/**
 * 「世界编年」—— 世界文献的投影，全部从真实节点读。
 *
 * 边界（诚实）：
 * - 这是投影，不是第二份真值：数据全来自世界文档的 story/history 条目；只是画出来。
 * - 纶元（era）是作者写的文字，**不是算法给的"历史感"**——用过的词就叫用过的词。
 * - 空状态如实渲染：没有 story/history 条目时就是空的编年册，不补假条目。
 * - 星图⇄编年双向联动（v710 §C）：哪些星图人物与本卷相连，由服务端算好（lib/era-ties，
 *   一跳、id 精确命中），本组件只渲染——零 provider，不做任何传递推断。
 * - 在场人物（作者声明）：`CharacterProfile.activeEra === entry.era` 才算在场，
 *   由作者在角色面板写进档案；chip 链接到 /world/<id>/constellation?character=<id>。
 * - memory 回声来自 lore.memory（≤240 字，可选），只显示原文，不润色、不补叙事。
 *
 * §FE-CRN 门面版：全 .crn-*（零 hex，零裸 atom），暗空画布与色块全由 var(--nexus-color-*)
 * 与 color-mix 组合成；SVG/CSS backgrounds 不写死色。
 */

interface PresentCharacter {
  id: string;
  name: string;
  activeEra?: string;
}

export function ChronicleView({
  worldName,
  projectId,
  eras,
  ties,
  characters = [],
}: {
  worldName: string;
  projectId: string;
  eras: ChronicleEra[];
  ties?: EraTie[];
  characters?: ReadonlyArray<PresentCharacter>;
}) {
  const total = eras.reduce((a, e) => a + e.entries.length, 0);

  if (total === 0) {
    return (
      <main className="crn-empty" data-chronicle-empty>
        <svg viewBox="0 0 48 48" width="56" height="56" fill="none" aria-hidden="true">
          <rect x="8" y="6" width="32" height="36" rx="3" stroke="var(--nexus-color-brand)" strokeWidth="1.6" />
          <path d="M16 14h16M16 22h16M16 30h10" stroke="var(--nexus-color-accent-mix)" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
        <h1 className="crn-emptyTitle">编年册还是空白</h1>
        <p className="crn-emptyCopy">
          「{worldName}」的世界文档里还没有 story / history 条目。去 Studio 的世界面板写一段历史——哪怕一行——编年册就会长出第一个纶元。
        </p>
      </main>
    );
  }

  return (
    <main className="crn-root" data-chronicle-root>
      <header className="crn-head">
        <div>
          <p className="crn-kicker" data-chronicle-kicker>CHRONICLE · {worldName}</p>
          <h1 className="crn-title">世界编年</h1>
        </div>
        <div className="crn-headCounts" data-chronicle-counts>
          <span>{eras.length} 个纶元</span>
          <span aria-hidden="true" className="crn-headDot">·</span>
          <span>{total} 条编年</span>
        </div>
      </header>

      {/* 横向编年 */}
      <div className="crn-scroll" role="region" aria-label="世界编年（可横向滚动）" tabIndex={0} data-chronicle-scroll>
        {eras.map((era, eraIndex) => (
          <section
            key={`${era.era}-${eraIndex}`}
            className="crn-era"
            data-chronicle-era={era.era}
            aria-label={`纶元：${era.era}`}
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
              <p className="crn-eraCount">{era.entries.length} 条编年</p>
            </div>
            <EraTiesStrip ties={ties} eraIndex={eraIndex} era={era.era} projectId={projectId} />
            <ol className="crn-list">
              {era.entries.map((entry, i) => (
                <ChronicleCard key={entry.id} entry={entry} eraIndex={eraIndex} entryIndex={i} eras={eras} characters={characters} projectId={projectId} />
              ))}
            </ol>
          </section>
        ))}
      </div>

      <footer className="crn-footnote" data-chronicle-footnote>
        只有 story / history 进编年 · era 是作者写的字面，不是算法给的"历史感" · 顺序按 lore.order（缺省 updatedAt）· 本页零写库
      </footer>
    </main>
  );
}

function EraTiesStrip({ ties, eraIndex, era, projectId }: { ties?: EraTie[]; eraIndex: number; era: string; projectId: string }) {
  if (!ties) return null;
  // 首选按位（chronicle 与 ties 同序）；降级按卷名匹配，防脏数据串卷
  const tie = ties[eraIndex]?.era === era ? ties[eraIndex]! : ties.find((t) => t.era === era);
  if (!tie) return null;
  const figures = tie.linkedCharacters;
  return (
    <div className="crn-ties" data-chronicle-ties={tie.era} aria-label="星图与本卷相连的人物">
      {figures.length === 0 ? (
        <span className="crn-tiesEmpty" data-chronicle-ties-empty>星图里还没有人物指向本卷的条目——在人物关系页给任意角色加一条「指向世界条目」的关系，这里就会亮起来。</span>
      ) : (
        <>
          <span className="crn-tiesLabel">本卷活跃的星图人物</span>
          {figures.map((fig) => (
            <Link
              key={fig.id}
              href={`/world/${projectId}/constellation`}
              className="crn-tie"
              data-chronicle-tie={fig.id}
              title={`与本卷 ${fig.viaEntryIds.length} 条编年相连`}
            >
              {fig.name}
            </Link>
          ))}
        </>
      )}
    </div>
  );
}

function ChronicleCard({ entry, eraIndex, entryIndex, eras, characters, projectId }: { entry: ChronicleEntry; eraIndex: number; entryIndex: number; eras: ChronicleEra[]; characters?: ReadonlyArray<PresentCharacter>; projectId?: string }) {
  const progress = eraProgress(eras, eraIndex, entryIndex);
  const kindClass = entry.kind === 'history' ? 'crn-kindTag crn-kindTagHistory' : 'crn-kindTag';
  const presentCharacters = characters?.filter((c) => c.activeEra && c.activeEra === entry.era) ?? [];
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
          {presentCharacters.map((c) => (
            <Link
              key={c.id}
              href={`/world/${projectId}/constellation?character=${c.id}`}
              className="crn-presentLink"
              data-chronicle-character={c.id}
              title={`在 ${entry.era} 在场`}
            >
              <span aria-hidden="true" className="crn-presentDot" />
              {c.name}
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
