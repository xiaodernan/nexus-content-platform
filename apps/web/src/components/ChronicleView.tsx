'use client';

import type { ChronicleEra, ChronicleEntry } from '@/lib/chronicle';
import { eraProgress } from '@/lib/chronicle';

/**
 * 序言 — 同「人物星图」：世界文档的投影，全部从真实节点读。
 *
 * 边界（诚实）：
 * - 这是投影，不是第二份真值：数据全来自世界文档的 story/history 条目；只是画出来。
 * - 父节点（era）是作者写的字面，**不是算法给的"历史感"**——用过的词就叫用过的词。
 * - 空状态如实渲染：没有 story/history 条目时就是空的编年册，不补假条目。
 *
 * §FE-CRN 门面版：全 .crn-*（零 hex，零裸 atom），暗空画布与色块全由 var(--nexus-color-*)
 * 与 color-mix 组合成；SVG/CSS backgrounds 不写死色。
 */
export function ChronicleView({ worldName, eras }: { worldName: string; eras: ChronicleEra[] }) {
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
          「{worldName}」的世界文档里还没有 story / history 条目。去 Studio 的世界面板写一段历史——哪怕一行——编年册就会长出第一个缝元。
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
          <span>{eras.length} 个缝元</span>
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
            aria-label={`缝元：${era.era}`}
          >
            {/* 缝元背景光 */}
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
            <ol className="crn-list">
              {era.entries.map((entry, i) => (
                <ChronicleCard key={entry.id} entry={entry} eraIndex={eraIndex} entryIndex={i} eras={eras} />
              ))}
            </ol>
          </section>
        ))}
      </div>

      <footer className="crn-footnote" data-chronicle-footnote>
        只有 story / history 进编年 · era 是作者写的字，不是算法给的“历史感” · 顺序按 lore.order（缺省 updatedAt） · 本页零写库
      </footer>
    </main>
  );
}

function ChronicleCard({ entry, eraIndex, entryIndex, eras }: { entry: ChronicleEntry; eraIndex: number; entryIndex: number; eras: ChronicleEra[] }) {
  const progress = eraProgress(eras, eraIndex, entryIndex);
  const kindClass = entry.kind === 'history' ? 'crn-kindTag crn-kindTagHistory' : 'crn-kindTag';
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
      <p className="crn-titleRow">{entry.title}</p>
      <time className="crn-time" dateTime={entry.updatedAt}>
        {entry.updatedAt.slice(0, 10)}
      </time>
    </li>
  );
}
