'use client';

import { useMemo, useState } from 'react';
import { cn } from '@/lib/cn';
import type { Character } from '@nexus/world-model';
import type { ConstellationGraph } from '@/lib/constellation';

/**
 * 「人物关系星图」（v704 / ROADMAP）—— 世界的角色之间到底谁连着谁，一眼看穿。
 *
 * v704 的边界（诚实）：
 * - 这是**投影**，不是第二份真值：数据全部来自角色档案与世界文档；只是画出来
 * - 黄金角螺旋摆位：同一批角色永远摆出同一张图；不引入物理模拟、不加随机
 * - 指向世界条目的关系解析成"世界锚点"暗星（外环）；解析不出的关系**不画**——面板
 *   脚注如实说 "N 条未解析未上图"，不假装它们存在
 * - 双向关系合并成一条边（两条 label）—— 图上不会出现两条重叠的线
 * - 空状态如实渲染：没有角色 ⇒ 没有星座，不补假星
 */

export function ConstellationPanel({
  projectName,
  projectId,
  characters,
  worldNodeTitles,
  graph,
}: {
  projectName: string;
  projectId: string;
  characters: Character[];
  worldNodeTitles: Record<string, string>;
  graph: ConstellationGraph;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = useMemo(() => characters.find((c) => c.id === selectedId) ?? null, [characters, selectedId]);
  const nameById = useMemo(() => new Map(characters.map((c) => [c.id, c.profile.name || '（没有名字）'])), [characters]);
  const targetLabel = (t: string) => nameById.get(t) ?? worldNodeTitles[t] ?? null;

  if (characters.length === 0) {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-[#070a14] px-6 text-center text-[#e8eaed]" data-constellation-empty>
        <svg viewBox="0 0 48 48" width="56" height="56" fill="none" aria-hidden="true">
          <path d="M24 4l3.2 8.6 9.1.1-7.3 5.5 2.7 8.4-7.7-5.2-7.7 5.2 2.7-8.4-7.3-5.5 9.1-.1L24 4Z" stroke="#5b6cff" strokeWidth="1.6" strokeLinejoin="round" fill="rgb(91 108 255 / 0.15)" />
        </svg>
        <h1 className="text-[var(--nexus-font-size-21)] font-semibold">星图还没有星</h1>
        <p className="max-w-md text-13 leading-6 text-[#aab2d8]">
          「{projectName}」还没有角色档案——星图读的是 §46 角色档案之间的关系。先去 Studio 建几个人物，这里会长出属于这个世界的星座。
        </p>
        <a href={`/studio/${projectId}`} className="mt-2 inline-flex min-h-10 items-center rounded-lg bg-[var(--nexus-color-brand)] px-5 py-2 text-13 font-semibold text-[var(--nexus-color-accent-fg)]" data-constellation-cta>
          去 Studio 的人物面板 →
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
    <main className="grid h-dvh grid-rows-[1fr_auto] overflow-hidden bg-[#070a14] text-[#e8eaed] lg:grid-cols-[1fr_392px] lg:grid-rows-1" data-constellation-root>
      {/* 星野 */}
      <section className="relative min-h-[52vh] overflow-hidden" aria-label="人物星图">
        <div aria-hidden="true" className="pointer-events-none absolute inset-0" style={{ backgroundImage: 'radial-gradient(circle at 18% 22%, rgba(139,149,255,0.16) 0, transparent 34%), radial-gradient(circle at 78% 68%, rgba(34,211,238,0.12) 0, transparent 30%), radial-gradient(1.2px 1.2px at 20% 30%, #ffffff88 50%, transparent 51%), radial-gradient(1px 1px at 66% 18%, #ffffff66 50%, transparent 51%), radial-gradient(1.4px 1.4px at 82% 42%, #ffffff55 50%, transparent 51%), radial-gradient(1px 1px at 34% 72%, #ffffff66 50%, transparent 51%), radial-gradient(1.2px 1.2px at 48% 48%, #ffffff4d 50%, transparent 51%)' }} />
        <header className="pointer-events-none absolute left-4 top-4 z-10">
          <p className="font-mono text-10 uppercase tracking-[0.22em] text-[#8b95ff]" data-constellation-kicker>CONSTELLATION · {projectName}</p>
          <h1 className="text-[var(--nexus-font-size-21)] font-semibold">人物关系星图</h1>
        </header>

        <svg viewBox={`0 0 ${W} ${H}`} className="h-full w-full" role="img" aria-label={`${characters.length} 个角色的关系星图`} data-constellation-svg>
          <defs>
            <filter id="starGlow" x="-60%" y="-60%" width="220%" height="220%">
              <feGaussianBlur stdDeviation="7" result="b" />
              <feMerge>
                <feMergeNode in="b" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            <radialGradient id="nodeFill">
              <stop offset="0%" stopColor="#ffffff" stopOpacity="0.95" />
              <stop offset="38%" stopColor="#c6ccff" stopOpacity="0.9" />
              <stop offset="100%" stopColor="#5b6cff" stopOpacity="0.55" />
            </radialGradient>
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
            const label = edge.reverse ? `${edge.kind} ⇄ ${edge.reverse.kind}` : edge.kind;
            return (
              <g key={edge.id} data-constellation-edge={edge.id}>
                <path
                  d={`M ${pa.x} ${pa.y} Q ${cxp} ${cyp} ${pb.x} ${pb.y}`}
                  fill="none"
                  stroke="url(#edgeGrad)"
                  strokeOpacity="0.5"
                  strokeWidth={edge.reverse ? 2.4 : 1.5}
                />
                <text x={cxp} y={cyp - 5} textAnchor="middle" fontSize="10.5" fill="#c9d0ff" fillOpacity="0.66" style={{ paintOrder: 'stroke', stroke: '#070a14', strokeWidth: 3 }}>
                  {label}
                </text>
              </g>
            );
          })}
          <defs>
            <linearGradient id="edgeGrad" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#5b6cff" />
              <stop offset="55%" stopColor="#8b95ff" />
              <stop offset="100%" stopColor="#22d3ee" />
            </linearGradient>
          </defs>

          {/* 世界锚点（暗星 · 外环） */}
          {graph.worldAnchors.map((anchor) => {
            const p = posOf(anchor.angle, 1.0);
            return (
              <g key={anchor.id} transform={`translate(${p.x} ${p.y})`} data-constellation-anchor={anchor.id}>
                <rect x="-7" y="-7" width="14" height="14" transform="rotate(45)" fill="#0e1330" stroke="#5b6cff" strokeOpacity="0.65" strokeWidth="1.4" rx="2" />
                <text x="0" y="26" textAnchor="middle" fontSize="10" fill="#aab2d8" style={{ paintOrder: 'stroke', stroke: '#070a14', strokeWidth: 3 }}>
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
                aria-label={`${node.name}，${node.degree} 条关系`}
                data-constellation-node={node.id}
                className="cursor-pointer outline-none"
                onClick={() => setSelectedId(active ? null : node.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setSelectedId(active ? null : node.id);
                  }
                }}
              >
                <circle r={r + 9} fill={firstPalette ?? '#5b6cff'} opacity={active ? 0.5 : 0.22} filter="url(#starGlow)" />
                <circle r={r} fill={firstPalette ?? 'url(#nodeFill)'} stroke={active ? '#ffffff' : '#c6ccff'} strokeWidth={active ? 2.2 : 1.2} fillOpacity="0.92" />
                {node.palette[1] ? <circle r={r * 0.62} fill="none" stroke={node.palette[1]} strokeWidth="2" strokeOpacity="0.85" strokeDasharray="3 5" /> : null}
                <text y={r + 16} textAnchor="middle" fontSize="11.5" fontWeight="600" fill="#eef0ff" style={{ paintOrder: 'stroke', stroke: '#070a14', strokeWidth: 3.4 }}>
                  {node.name}
                </text>
                {node.degree > 0 ? (
                  <g transform={`translate(${r - 2} ${-r + 2})`}>
                    <circle r="9" fill="#121847" stroke="#8b95ff" strokeWidth="1.1" />
                    <text y="3.2" textAnchor="middle" fontSize="9.5" fill="#c6ccff" className="font-mono">{node.degree}</text>
                  </g>
                ) : null}
              </g>
            );
          })}
        </svg>

        {/* 计数脚注 */}
        <footer className="pointer-events-none absolute bottom-3 left-4 right-4 z-10 flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-10 text-[#8b95ff]/80" data-constellation-counts>
          <span>{graph.nodes.length} 星</span>
          <span>{graph.edges.length} 条双向合并的边</span>
          <span>{graph.worldAnchors.length} 个世界锚点</span>
          {graph.unresolved.length > 0 ? <span>{graph.unresolved.length} 条未解析未上图</span> : null}
        </footer>
      </section>

      {/* 详情面板 */}
      <aside className="flex min-h-0 flex-col gap-3 overflow-y-auto border-l border-[#1b2244] bg-[#0a0e22]/90 p-4 backdrop-blur" aria-label="角色详情" data-constellation-panel>
        {selected ? (
          <>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-[var(--nexus-font-size-21)] font-semibold">{selected.profile.name || '（没有名字）'}</h2>
              <a href={`/studio/${projectId}`} className="text-11 text-[#8b95ff] underline" data-constellation-open-studio>
                去 Studio 人物面板 →
              </a>
            </div>
            {selected.profile.identity ? <p className="text-13 leading-6 text-[#d6dbf5]" data-constellation-identity>{selected.profile.identity}</p> : null}
            {selected.profile.activeEra ? (
              <p className="mt-1 inline-flex items-center gap-1.5 self-start rounded-full border border-[#26315e] bg-[#101732] px-2.5 py-0.5 text-10 font-medium uppercase tracking-[0.18em] text-[#8b95ff]" data-constellation-era>
                <span aria-hidden="true" className="inline-block h-1.5 w-1.5 rounded-full bg-[#5b6cff]" />
                {selected.profile.activeEra}
              </p>
            ) : null}
            {selected.profile.personality ? <p className="text-11 leading-5 text-[#aab2d8]">{selected.profile.personality}</p> : null}

            {selected.profile.visualIdentity.palette.length > 0 ? (
              <div className="flex flex-wrap gap-1.5" data-constellation-palette>
                {selected.profile.visualIdentity.palette.map((hex) => (
                  <span key={hex} title={hex} className="inline-flex items-center gap-1.5 rounded-full border border-[#222a52] bg-[#111737] py-0.5 pl-1 pr-2 text-10 text-[#c6ccff]">
                    <span className="h-3 w-3 rounded-full" style={{ background: hex }} />
                    <span className="font-mono">{hex}</span>
                  </span>
                ))}
              </div>
            ) : null}

            {selected.profile.traits.length > 0 ? (
              <div className="flex flex-wrap gap-1" data-constellation-traits>
                {selected.profile.traits.map((t) => (
                  <span key={t} className="rounded bg-[#141b3d] px-1.5 py-0.5 text-10 text-[#a8e3ff]">{t}</span>
                ))}
              </div>
            ) : null}

            {selected.profile.voice.register || selected.profile.voice.catchphrases.length > 0 ? (
              <section className="rounded-lg border border-[#1b2244] bg-[#0d1230] p-3" data-constellation-voice>
                <p className="font-mono text-10 uppercase tracking-[0.18em] text-[#8b95ff]">VOICE</p>
                {selected.profile.voice.register ? <p className="mt-1 text-12 text-[#d6dbf5]">{selected.profile.voice.register}{selected.profile.voice.pace ? ` · ${selected.profile.voice.pace}` : ''}</p> : null}
                {selected.profile.voice.catchphrases.length > 0 ? (
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {selected.profile.voice.catchphrases.map((c) => (
                      <span key={c} className="rounded-full border border-[#2a3468] px-2 py-0.5 text-10 text-[#dcd6ff]">「{c}」</span>
                    ))}
                  </div>
                ) : null}
              </section>
            ) : null}

            {selected.profile.goals.length > 0 || selected.profile.fears.length > 0 ? (
              <section className="grid grid-cols-2 gap-2" data-constellation-gfe>
                {selected.profile.goals.length > 0 ? (
                  <div className="rounded-lg border border-[#1b2244] bg-[#0d1230] p-2.5">
                    <p className="font-mono text-10 uppercase tracking-[0.18em] text-emerald-300/80">欲望</p>
                    <ul className="mt-1 list-none space-y-1 text-11 text-[#d6dbf5]">{selected.profile.goals.slice(0, 4).map((g) => <li key={g}>→ {g}</li>)}</ul>
                  </div>
                ) : null}
                {selected.profile.fears.length > 0 ? (
                  <div className="rounded-lg border border-[#1b2244] bg-[#0d1230] p-2.5">
                    <p className="font-mono text-10 uppercase tracking-[0.18em] text-rose-300/80">恐惧</p>
                    <ul className="mt-1 list-none space-y-1 text-11 text-[#d6dbf5]">{selected.profile.fears.slice(0, 4).map((f) => <li key={f}>× {f}</li>)}</ul>
                  </div>
                ) : null}
              </section>
            ) : null}

            <section data-constellation-relationships>
              <p className="font-mono text-10 uppercase tracking-[0.18em] text-[#8b95ff]">关系</p>
              {selected.profile.relationships.length === 0 ? (
                <p className="mt-1 text-11 text-[#8b95ff]/70">还没有写下关系——这个人还没有被连上这个世界。</p>
              ) : (
                <ul className="mt-1.5 space-y-1.5">
                  {selected.profile.relationships.map((rel, i) => {
                    const label = targetLabel(rel.target);
                    const resolvable = label !== null && characters.some((c) => c.id === rel.target);
                    const anchor = label !== null && !resolvable;
                    return (
                      <li key={`${i}-${rel.target}`} className="rounded-md border border-[#1b2244] bg-[#0d1230] p-2 text-11">
                        <div className="flex flex-wrap items-baseline gap-x-2">
                          <span className={cn('font-medium', resolvable ? 'text-[#c6ccff]' : anchor ? 'text-[#a8e3ff]' : 'text-rose-300/80')}>
                            {resolvable ? (
                              <button type="button" className="underline" data-constellation-jump={rel.target} onClick={() => setSelectedId(rel.target)}>
                                {label}
                              </button>
                            ) : anchor ? (
                              <>◆ {label}</>
                            ) : (
                              <>? {rel.target || '（空 target）'}</>
                            )}
                          </span>
                          <span className="rounded bg-[#141b3d] px-1.5 py-0.5 text-10 text-[#a8e3ff]">{rel.kind || '—'}</span>
                        </div>
                        {rel.note ? <p className="mt-1 text-10 text-[#aab2d8]">{rel.note}</p> : null}
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          </>
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center" data-constellation-hint>
            <p className="font-mono text-10 uppercase tracking-[0.22em] text-[#8b95ff]">SELECT A STAR</p>
            <p className="max-w-[260px] text-12 leading-5 text-[#aab2d8]">点一颗星看这个人——他的语域、口头禅、欲望与恐惧、他在这个世界里拴着谁。</p>
          </div>
        )}
        {graph.unresolved.length > 0 ? (
          <p className="mt-auto border-t border-[#1b2244] pt-2 text-10 leading-4 text-[#8b95ff]/60" data-constellation-unresolved>
            {graph.unresolved.length} 条关系指向不存在的名字（未上图）：
            {graph.unresolved.slice(0, 3).map((u) => `「${u.target}」（${u.ownerName}）`).join('、')}
            {graph.unresolved.length > 3 ? ' …' : ''}
          </p>
        ) : null}
      </aside>
    </main>
  );
}
