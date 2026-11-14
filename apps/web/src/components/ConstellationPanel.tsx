'use client';

import { useMemo, useState } from 'react';
import type { Character } from '@nexus/world-model';
import type { ConstellationGraph } from '@/lib/constellation';
import type { Locale } from '@/lib/i18n';

/**
 * 双语（v725）：locale 由上层 RSC 读 cookie 传入，COPY 字典一中一英，不机翻、不夹带。
 */
const COPY = {
  zh: {
    emptyTitle: '星图还没有星',
    emptyCopy: (name: string) => `「${name}」还没有角色档案——星图读的是 §46 角色档案之间的关系。先去 Studio 建几个人物，这里会长出属于这个世界的星链。`,
    emptyCta: '去 Studio 的人物面板 →',
    unnamed: '（没有名字）',
    svgLabel: (n: number) => `${n} 个角色的关系星图`,
    title: '人物关系星图',
    kickerPrefix: 'CONSTELLATION',
    starUnit: '星',
    edgeMerge: '条双向合并的边',
    anchorUnit: '个世界锚点',
    unresolvedCount: '条未解析未上图',
    panelAria: '角色详情',
    studioLink: '去 Studio 人物面板 →',
    wantsTag: '欲望',
    fearsTag: '恐惧',
    relTitle: '关系',
    relEmpty: '还没有写下关系——这个人还没有被连上这个世界。',
    emptyTarget: '（空 target）',
    hintCopy: '点一颗星看这个人——他的语气、口头禅、欲望与惧怕、他在这个世界里拉扯谁。',
    unresolvedPrefix: '条关系指向不存在的名字（未上图）：',
    canvasAria: '人物星图',
  },
  en: {
    emptyTitle: 'The map has no stars yet',
    emptyCopy: (name: string) => `「${name}」 has no character profiles yet — the map reads the relationships between character profiles. Build a few characters in Studio and your world grows its own star-links.`,
    emptyCta: 'Go to the character panel in Studio →',
    unnamed: '(unnamed)',
    svgLabel: (n: number) => `${n} characters’ relationship map`,
    title: 'Character constellation',
    kickerPrefix: 'CONSTELLATION',
    starUnit: 'stars',
    edgeMerge: 'dual-merged edges',
    anchorUnit: 'world anchor(s)',
    unresolvedCount: 'unresolved, unmapped',
    panelAria: 'Character detail',
    studioLink: 'Go to the character panel in Studio →',
    wantsTag: 'Wants',
    fearsTag: 'Fears',
    relTitle: 'Relationships',
    relEmpty: 'No relationships written yet — this person is not woven into this world.',
    emptyTarget: '(empty target)',
    hintCopy: 'Tap a star to see this person — voice, catchphrases, wants and fears, who they tug against in this world.',
    unresolvedPrefix: 'relationship(s) target names that do not exist on the map:',
    canvasAria: 'Character constellation',
  },
} as const;

/**
 * §FE-CNS 「人物关系星图」—— world 的角色之间到底谁连着谁，一眼看清。
 * §FE 门面版：
 * - `.cns-*` 门面族，零 hex、零 raw atom；深空画板由 tokens（brand/accent）配色，
 *   SVG 用 var(--nexus-color-*) 取色
 * - aria / role / tabIndex / data-cns-* 钩子守恒
 *
 * 边界（诚实）：
 * - 这是**投影**，不是第二份真值：数据全部来自角色档案与世界文档；只是画出来
 * - 金角麟摇总：同一批角色永远摆出同一张图；不引入物理模拟、不加随机
 * - 指向世界条目的关系解析成"世界锚点"暂星（外档）；解析不出的关系**不画**——面板
 *   脚注如实说"N 条未解析未上图"，不假装它们存在
 * - 双向关系合并成一条边（两条 label）——图上不会出现两条重叠的线
 * - 空状态如实渲染：没有角色 ⛒ 没有星座，不补假星
 */
export function ConstellationPanel({
  projectName,
  projectId,
  characters,
  worldNodeTitles,
  graph,
  locale = 'zh',
}: {
  projectName: string;
  projectId: string;
  characters: Character[];
  worldNodeTitles: Record<string, string>;
  graph: ConstellationGraph;
  locale?: Locale;
}) {
  const c = COPY[locale];
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = useMemo(() => characters.find((c) => c.id === selectedId) ?? null, [characters, selectedId]);
  const nameById = useMemo(() => new Map(characters.map((char) => [char.id, char.profile.name || c.unnamed])), [characters, c.unnamed]);
  const targetLabel = (t: string) => nameById.get(t) ?? worldNodeTitles[t] ?? null;

  if (characters.length === 0) {
    return (
      <main className="cns-empty" data-constellation-empty>
        <svg viewBox="0 0 48 48" width="56" height="56" fill="none" aria-hidden="true">
          <path d="M24 4l3.2 8.6 9.1.1-7.3 5.5 2.7 8.4-7.7-5.2-7.7 5.2 2.7-8.4-7.3-5.5 9.1-.1L24 4Z" stroke="var(--nexus-color-brand)" strokeWidth="1.6" strokeLinejoin="round" fill="var(--nexus-color-brand)" fillOpacity="0.15" />
        </svg>
        <h1 className="cns-emptyTitle">{c.emptyTitle}</h1>
        <p className="cns-emptyCopy">{c.emptyCopy(projectName)}</p>
        <a href={`/studio/${projectId}`} className="cns-emptyCta" data-constellation-cta>
          {c.emptyCta}
        </a>
      </main>
    );
  }

  const W = 1200;
  const H = 760;
  const cx = 430;
  const cy = H / 2;
  const maxR = Math.min(W, H) / 2 - 60;
  const posOf = (angle: number, radius: number) => ({
    x: cx + Math.cos(angle) * radius * maxR,
    y: cy + Math.sin(angle) * radius * maxR,
  });
  const nodeById = new Map(graph.nodes.map((n) => [n.id, n]));
  const degreeOf = (id: string) => nodeById.get(id)?.degree ?? 0;
  const nodeRadius = (id: string) => 15 + Math.min(13, degreeOf(id) * 3);

  return (
    <main className="cns-shell" data-constellation-root>
      {/* 星空 */}
      <section className="cns-canvas" aria-label={c.canvasAria}>
        <div aria-hidden="true" className="cns-starfield" />
        <header className="cns-kicker">
          <p className="cns-kickerLine" data-constellation-kicker>{c.kickerPrefix} · {projectName}</p>
          <h1 className="cns-title">{c.title}</h1>
        </header>

        <svg viewBox={`0 0 ${W} ${H}`} className="cns-svg" role="img" aria-label={c.svgLabel(characters.length)} data-constellation-svg>
          <defs>
            <filter id="starGlow" x="-60%" y="-60%" width="220%" height="220%">
              <feGaussianBlur stdDeviation="7" result="b" />
              <feMerge>
                <feMergeNode in="b" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            <radialGradient id="nodeFill">
              <stop offset="0%" stopColor="var(--nexus-color-fg-1)" stopOpacity="0.95" />
              <stop offset="38%" stopColor="var(--nexus-color-accent-mix)" stopOpacity="0.9" />
              <stop offset="100%" stopColor="var(--nexus-color-brand)" stopOpacity="0.55" />
            </radialGradient>
            <linearGradient id="edgeGrad" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="var(--nexus-color-brand)" />
              <stop offset="55%" stopColor="var(--nexus-color-accent-mix)" />
              <stop offset="100%" stopColor="var(--nexus-color-accent-2)" />
            </linearGradient>
          </defs>

          {/* 关系边 */}
          {graph.edges.map((edge) => {
            const A = nodeById.get(edge.from);
            const B = nodeById.get(edge.to);
            if (!A || !B) return null;
            const pa = posOf(A.angle, A.radius);
            const pb = posOf(B.angle, B.radius);
            const mx = (pa.x + pb.x) / 2;
            const my = (pa.y + pb.y) / 2;
            const nx = pb.x - pa.x;
            const ny = pb.y - pa.y;
            const len = Math.hypot(nx, ny) || 1;
            const bend = Math.min(60, len * 0.18);
            const cxp = mx - (ny / len) * bend;
            const cyp = my + (nx / len) * bend;
            const label = edge.reverse ? `${edge.kind} ⛒ ${edge.reverse.kind}` : edge.kind;
            return (
              <g key={edge.id} data-constellation-edge={edge.id}>
                <path
                  d={`M ${pa.x} ${pa.y} Q ${cxp} ${cyp} ${pb.x} ${pb.y}`}
                  fill="none"
                  stroke="url(#edgeGrad)"
                  strokeOpacity="0.5"
                  strokeWidth={edge.reverse ? 2.4 : 1.5}
                />
                <text x={cxp} y={cyp - 5} textAnchor="middle" fontSize="10.5" fill="var(--nexus-color-accent-mix)" fillOpacity="0.66" style={{ paintOrder: 'stroke', stroke: 'var(--nexus-color-bg-0)', strokeWidth: 3 }}>
                  {label}
                </text>
              </g>
            );
          })}

          {/* 世界锚点（暗星 · 外环） */}
          {graph.worldAnchors.map((anchor) => {
            const p = posOf(anchor.angle, 1.0);
            return (
              <g key={anchor.id} transform={`translate(${p.x} ${p.y})`} data-constellation-anchor={anchor.id}>
                <rect x="-7" y="-7" width="14" height="14" transform="rotate(45)" fill="var(--nexus-color-bg-1)" stroke="var(--nexus-color-brand)" strokeOpacity="0.65" strokeWidth="1.4" rx="2" />
                <text x="0" y="26" textAnchor="middle" fontSize="10" fill="var(--nexus-color-fg-3)" style={{ paintOrder: 'stroke', stroke: 'var(--nexus-color-bg-0)', strokeWidth: 3 }}>
                  {anchor.label}
                </text>
              </g>
            );
          })}

          {/* 角色星 */}
          {graph.nodes.map((node) => {
            const p = posOf(node.angle, node.radius);
            const r = nodeRadius(node.id);
            const active = node.id === selectedId;
            const firstPalette = node.palette[0];
            return (
              <g
                key={node.id}
                transform={`translate(${p.x} ${p.y})`}
                role="button"
                tabIndex={0}
                aria-pressed={active}
                aria-label={`${node.name}${locale === 'en' ? ` (${node.degree} relationships)` : `（${node.degree} 条关系）`}`}
                data-constellation-node={node.id}
                className="cns-node"
                onClick={() => setSelectedId(active ? null : node.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setSelectedId(active ? null : node.id);
                  }
                }}
              >
                <circle r={r + 9} fill={firstPalette ?? 'var(--nexus-color-brand)'} opacity={active ? 0.5 : 0.22} filter="url(#starGlow)" />
                <circle r={r} fill={firstPalette ?? 'url(#nodeFill)'} stroke={active ? 'var(--nexus-color-fg-1)' : 'var(--nexus-color-accent-mix)'} strokeWidth={active ? 2.2 : 1.2} fillOpacity="0.92" />
                {node.palette[1] ? <circle r={r * 0.62} fill="none" stroke={node.palette[1]} strokeWidth="2" strokeOpacity="0.85" strokeDasharray="3 5" /> : null}
                <text y={r + 16} textAnchor="middle" fontSize="11.5" fontWeight="600" fill="var(--nexus-color-fg-1)" style={{ paintOrder: 'stroke', stroke: 'var(--nexus-color-bg-0)', strokeWidth: 3.4 }}>
                  {node.name}
                </text>
                {node.degree > 0 ? (
                  <g transform={`translate(${r - 2} ${-r + 2})`}>
                    <circle r="9" fill="var(--nexus-color-bg-2)" stroke="var(--nexus-color-accent-mix)" strokeWidth="1.1" />
                    <text y="3.2" textAnchor="middle" fontSize="9.5" fill="var(--nexus-color-accent-mix)" className="cns-nodeDegreeText">{node.degree}</text>
                  </g>
                ) : null}
              </g>
            );
          })}
        </svg>

        {/* 计数脚注 */}
        <footer className="cns-counts" data-constellation-counts>
          <span>{graph.nodes.length} {c.starUnit}</span>
          <span>{graph.edges.length} {c.edgeMerge}</span>
          <span>{graph.worldAnchors.length} {c.anchorUnit}</span>
          {graph.unresolved.length > 0 ? <span>{graph.unresolved.length} {c.unresolvedCount}</span> : null}
        </footer>
      </section>

      {/* 详情面板 */}
      <aside className="cns-panel" aria-label={c.panelAria} data-constellation-panel>
        {selected ? (
          <>
            <div className="cns-panelHead">
              <h2 className="cns-panelTitle">{selected.profile.name || c.unnamed}</h2>
              <a href={`/studio/${projectId}`} className="cns-panelLink" data-constellation-open-studio>
                {c.studioLink}
              </a>
            </div>
            {selected.profile.identity ? <p className="cns-identity" data-constellation-identity>{selected.profile.identity}</p> : null}
            {selected.profile.activeEra ? (
              <p className="cns-era" data-constellation-era>
                <span aria-hidden="true" className="cns-eraDot" />
                {selected.profile.activeEra}
              </p>
            ) : null}
            {selected.profile.personality ? <p className="cns-personality">{selected.profile.personality}</p> : null}

            {selected.profile.visualIdentity.palette.length > 0 ? (
              <div className="cns-palette" data-constellation-palette>
                {selected.profile.visualIdentity.palette.map((hex) => (
                  <span key={hex} title={hex} className="cns-paletteSwatch">
                    <span className="cns-paletteDot" style={{ background: hex }} />
                    <span className="cns-paletteHex">{hex}</span>
                  </span>
                ))}
              </div>
            ) : null}

            {selected.profile.traits.length > 0 ? (
              <div className="cns-traits" data-constellation-traits>
                {selected.profile.traits.map((t) => (
                  <span key={t} className="cns-trait">{t}</span>
                ))}
              </div>
            ) : null}

            {selected.profile.voice.register || selected.profile.voice.catchphrases.length > 0 ? (
              <section className="cns-voice" data-constellation-voice>
                <p className="cns-sectionTag">VOICE</p>
                {selected.profile.voice.register ? (
                  <p className="cns-voiceLine">
                    {selected.profile.voice.register}{selected.profile.voice.pace ? ` · ${selected.profile.voice.pace}` : ''}
                  </p>
                ) : null}
                {selected.profile.voice.catchphrases.length > 0 ? (
                  <div className="cns-voiceCatch">
                    {selected.profile.voice.catchphrases.map((c) => (
                      <span key={c} className="cns-voiceWord">「{c}」</span>
                    ))}
                  </div>
                ) : null}
              </section>
            ) : null}

            {selected.profile.goals.length > 0 || selected.profile.fears.length > 0 ? (
              <section className="cns-goals" data-constellation-gfe>
                {selected.profile.goals.length > 0 ? (
                  <div className="cns-goalsCell">
                    <p className="cns-goalsCellTag cns-goalsCellTagWant">{c.wantsTag}</p>
                    <ul className="cns-goalsList">{selected.profile.goals.slice(0, 4).map((g) => <li key={g}>→ {g}</li>)}</ul>
                  </div>
                ) : null}
                {selected.profile.fears.length > 0 ? (
                  <div className="cns-goalsCell">
                    <p className="cns-goalsCellTag cns-goalsCellTagFear">{c.fearsTag}</p>
                    <ul className="cns-goalsList">{selected.profile.fears.slice(0, 4).map((f) => <li key={f}>× {f}</li>)}</ul>
                  </div>
                ) : null}
              </section>
            ) : null}

            <section data-constellation-relationships>
              <p className="cns-sectionTag">{c.relTitle}</p>
              {selected.profile.relationships.length === 0 ? (
                <p className="cns-relationshipsEmpty">{c.relEmpty}</p>
              ) : (
                <ul className="cns-relationshipsList">
                  {selected.profile.relationships.map((rel, i) => {
                    const label = targetLabel(rel.target);
                    const resolvable = label !== null && characters.some((c) => c.id === rel.target);
                    const anchor = label !== null && !resolvable;
                    return (
                      <li key={`${i}-${rel.target}`} className="cns-relationshipsItem">
                        <div className="cns-relationshipsItemHead">
                          <span className={resolvable ? 'cns-relationshipsItemName cns-relationshipsItemNameResolved' : anchor ? 'cns-relationshipsItemName cns-relationshipsItemNameAnchor' : 'cns-relationshipsItemName cns-relationshipsItemNameMiss'}>
                            {resolvable ? (
                              <button type="button" className="cns-relationshipsJump" data-constellation-jump={rel.target} onClick={() => setSelectedId(rel.target)}>
                                {label}
                              </button>
                            ) : anchor ? (
                              <>◇ {label}</>
                            ) : (
                              <>? {rel.target || c.emptyTarget}</>
                            )}
                          </span>
                          <span className="cns-relationshipsKind">{rel.kind || '—'}</span>
                        </div>
                        {rel.note ? <p className="cns-relationshipsNote">{rel.note}</p> : null}
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          </>
        ) : (
          <div className="cns-panelHint" data-constellation-hint>
            <p className="cns-panelHintTag">SELECT A STAR</p>
            <p className="cns-panelHintCopy">{c.hintCopy}</p>
          </div>
        )}
        {graph.unresolved.length > 0 ? (
          <p className="cns-unresolved" data-constellation-unresolved>
            {graph.unresolved.length} {c.unresolvedPrefix}
            {graph.unresolved.slice(0, 3).map((u) => `「${u.target}」（${u.ownerName}）`).join(locale === 'en' ? ' / ' : '、')}
            {graph.unresolved.length > 3 ? ' …' : ''}
          </p>
        ) : null}
      </aside>
    </main>
  );
}
