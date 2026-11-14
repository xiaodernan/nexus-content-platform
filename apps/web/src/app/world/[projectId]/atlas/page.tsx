import Link from 'next/link';
import { notFound } from 'next/navigation';
import { loadWorld } from '@/server/domain/worlds';
import { loadDocument } from '@/server/domain/projects';
import { projectVisibleTo } from '@/server/domain/team';
import { requireUser } from '@/server/domain/session';
import { getLocale, type Locale } from '@/lib/i18n';
import type { WorldKind } from '@nexus/world-model';

export const dynamic = 'force-dynamic';

/**
 * 「寰宇图志」— 世界里的空间条目（地理 / 势力）的一张夜图。
 * 与编年（时间）、回廊（记忆）、星图（角色）是同一套投影纪律：
 * 零写库、读不到就说读不到、位置由确定性算法（黄金角螺旋 phyllotaxis）给出，
 * 同一份文档永远是同一张图。选择通过 `?pin=<id>` 查询参数驱动（SSR，零客户端状态）。
 * 全站双语（v733）：COPY 中英一辞两字面，locale 由 getLocale() 读，不夹杂。
 */

interface AtlasPin {
  id: string;
  kind: WorldKind;
  kindLabel: string;
  title: string;
  body: string;
  updatedAt: string;
}

const ATLAS_KINDS: ReadonlySet<string> = new Set(['geography', 'factions']);
const GOLDEN_ANGLE = 137.508;
const MAX_PINS = 160;
const W = 720;
const H = 560;
const CX = W / 2;
const CY = H / 2;
const R_MAX = Math.min(W, H) / 2 - 56;

const COPY: Record<Locale, {
  kicker: (project: string) => string;
  title: string;
  lede: string;
  navAlmanac: string;
  navWalk: string;
  navConstellation: string;
  navChronicle: string;
  navMemories: string;
  navQuiz: string;
  navAria: string;
  emptyTitle: string;
  emptyCopy: string;
  untitled: string;
  starLedger: string;
  pinsCount: (n: number) => string;
  detailKind: (label: string) => string;
  entryUntitled: string;
  selectEmpty: string;
  recorded: (date: string) => string;
  caption: (geo: number, factions: number) => string;
  legendGeo: string;
  legendFaction: string;
  legendLey: string;
  ariaMap: string;
  kindGeography: string;
  kindFactions: string;
}> = {
  zh: {
    kicker: (project) => `ATLAS · ${project}`,
    title: '寰宇图志',
    lede: '世界里的空间与势力，在一张夜图上星火对峙。位置由黄金角螺旋确定——同一份世界文档，每一次都摊开同一张图。',
    navAlmanac: '世界藏经阁',
    navWalk: '世界步行',
    navConstellation: '角色星图',
    navChronicle: '世界编年',
    navMemories: '记忆回廊',
    navQuiz: '谜灯馆',
    navAria: '世界子页导航',
    emptyTitle: '这片夜空还是空白。',
    emptyCopy: '去 Studio 的世界面板建立地理（geography）或势力（factions）条目，它们就会在此升起。',
    untitled: '（无题）',
    starLedger: '星位名录',
    pinsCount: (n) => `${n} 座`,
    detailKind: (label) => `${label} 志`,
    entryUntitled: '（无题志——去 Studio 补一句。）',
    selectEmpty: '选择一颗星位。',
    recorded: (date) => `记录于 ${date}`,
    caption: (geo, factions) => `${geo} 地理 · ${factions} 势力 · 黄金角 ${GOLDEN_ANGLE}°`,
    legendGeo: '地理',
    legendFaction: '势力',
    legendLey: '灵脉',
    ariaMap: '寰宇图志夜图',
    kindGeography: '地理',
    kindFactions: '势力',
  },
  en: {
    kicker: (project) => `ATLAS · ${project}`,
    title: 'The Atlas',
    lede: 'Geography and factions poised flame-to-flame on a night map. Positions come from a golden-angle spiral — the same document, the same map, every time.',
    navAlmanac: 'Almanac',
    navWalk: 'World Walk',
    navConstellation: 'Constellation',
    navChronicle: 'Chronicle',
    navMemories: 'Memory Corridor',
    navQuiz: 'Lantern Trial',
    navAria: 'World section navigation',
    emptyTitle: 'This night sky is still blank.',
    emptyCopy: 'Create geography or faction entries in the Studio world panel — they will rise here.',
    untitled: '(untitled)',
    starLedger: 'The Star Ledger',
    pinsCount: (n) => `${n} pins`,
    detailKind: (label) => `On ${label}`,
    entryUntitled: '(No entry yet — write one line in Studio.)',
    selectEmpty: 'Choose a star.',
    recorded: (date) => `Recorded ${date}`,
    caption: (geo, factions) => `${geo} geography · ${factions} factions · golden angle ${GOLDEN_ANGLE}°`,
    legendGeo: 'Geography',
    legendFaction: 'Factions',
    legendLey: 'Ley lines',
    ariaMap: 'Atlas night map',
    kindGeography: 'Geography',
    kindFactions: 'Factions',
  },
};

/** Deterministic PRNG: stable SSR, never Math.random. */
function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Golden-angle phyllotaxis: discrete, collision-free, visually even. */
function phyllotaxis(count: number): Array<{ x: number; y: number }> {
  const points: Array<{ x: number; y: number }> = [];
  for (let i = 0; i < count; i += 1) {
    const angle = (i * GOLDEN_ANGLE * Math.PI) / 180;
    const r = R_MAX * Math.sqrt((i + 0.5) / count);
    points.push({ x: CX + r * Math.cos(angle), y: CY + r * Math.sin(angle) });
  }
  return points;
}

/** Nearest-neighbour greedy edges (undirected, deduped), capped at ceil(1.15n). */
function leyLines(pins: readonly AtlasPin[], pts: ReadonlyArray<{ x: number; y: number }>): Array<[number, number]> {
  const n = pins.length;
  const at = (i: number) => pts[i]!;
  const candidates: Array<{ a: number; b: number; d: number }> = [];
  for (let i = 0; i < n; i += 1) {
    for (let j = i + 1; j < n; j += 1) {
      const dx = at(i).x - at(j).x;
      const dy = at(i).y - at(j).y;
      candidates.push({ a: i, b: j, d: Math.hypot(dx, dy) });
    }
  }
  candidates.sort((p, q) => p.d - q.d);
  const degree = new Array<number>(n).fill(0);
  const used = new Set<string>();
  const edges: Array<[number, number]> = [];
  const cap = Math.max(3, Math.ceil(n * 1.15));
  for (const c of candidates) {
    if (edges.length >= cap) break;
    const dA = degree[c.a] ?? 0;
    const dB = degree[c.b] ?? 0;
    if (dA >= 3 || dB >= 3) continue;
    const key = `${c.a}:${c.b}`;
    if (used.has(key)) continue;
    used.add(key);
    degree[c.a] = dA + 1;
    degree[c.b] = dB + 1;
    edges.push([c.a, c.b]);
  }
  return edges;
}

export default async function AtlasPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ pin?: string | string[] }>;
}) {
  const [{ projectId }, locale] = await Promise.all([params, getLocale()]);
  const c = COPY[locale];
  const user = await requireUser();
  if (!(await projectVisibleTo(projectId, user.id))) notFound();

  const [world, project, query] = await Promise.all([loadWorld(projectId), loadDocument(projectId), searchParams]);
  if (!project) notFound();

  const worldOk = world && world.ok ? world.document : null;
  const kindLabelOf = (kind: string): string => (kind === 'geography' ? c.kindGeography : c.kindFactions);
  const pins: AtlasPin[] = worldOk
    ? worldOk.nodes
        .filter((n) => ATLAS_KINDS.has(n.kind as string))
        .map((n): AtlasPin => {
          const kind = n.kind as WorldKind;
          return {
            id: n.id,
            kind,
            kindLabel: kindLabelOf(kind),
            title: typeof n.title === 'string' && n.title.trim() ? n.title.trim() : c.untitled,
            body: typeof n.body === 'string' ? n.body.trim() : '',
            updatedAt: typeof n.updatedAt === 'string' ? n.updatedAt : '',
          };
        })
        .sort((a, b) => a.id.localeCompare(b.id))
        .slice(0, MAX_PINS)
    : [];

  const geography = pins.filter((p) => p.kind === 'geography');
  const factions = pins.filter((p) => p.kind === 'factions');
  const pts = phyllotaxis(pins.length);
  const edges = pins.length > 1 ? leyLines(pins, pts) : [];

  const rand = mulberry32(0x5eed_face);
  const stars = Array.from({ length: 110 }, () => ({
    x: rand() * W,
    y: rand() * H,
    r: 0.4 + rand() * 1.15,
    o: 0.25 + rand() * 0.75,
  }));

  const pinParam = typeof query?.pin === 'string' ? query.pin : Array.isArray(query?.pin) ? query.pin[0] : undefined;
  const selected = pins.find((p) => p.id === pinParam) ?? pins[0];

  return (
    <main className="atl-root" data-atlas-root>
      <header className="atl-head">
        <div>
          <p className="atl-kicker">{c.kicker(project.name)}</p>
          <h1 className="atl-title">{c.title}</h1>
          <p className="atl-lede">{c.lede}</p>
        </div>
        <nav className="world-nav" aria-label={c.navAria}>
          <Link href={`/world/${projectId}/almanac`} className="world-navLink">{c.navAlmanac}</Link>
          <Link href={`/world/${projectId}`} className="world-navLink">{c.navWalk}</Link>
          <Link href={`/world/${projectId}/constellation`} className="world-navLink">{c.navConstellation}</Link>
          <Link href={`/world/${projectId}/chronicle`} className="world-navLink">{c.navChronicle}</Link>
          <Link href={`/world/${projectId}/memories`} className="world-navLink">{c.navMemories}</Link>
          <Link href={`/world/${projectId}/quiz`} className="world-navLink world-navLinkQuiz">{c.navQuiz}</Link>
        </nav>
      </header>

      {pins.length === 0 ? (
        <div className="atl-empty" data-atlas-empty>
          <p className="atl-emptyTitle">{c.emptyTitle}</p>
          <p className="atl-emptyCopy">{c.emptyCopy}</p>
        </div>
      ) : (
        <div className="atl-layout">
          <figure className="atl-map">
            <svg viewBox={`0 0 ${W} ${H}`} role="group" aria-label={c.ariaMap} className="atl-svg" data-atlas-svg>
              <defs>
                <radialGradient id="atlas-sky" cx="50%" cy="42%" r="75%">
                  <stop offset="0%" stopColor="#131a3d" />
                  <stop offset="55%" stopColor="#0b1027" />
                  <stop offset="100%" stopColor="#05070f" />
                </radialGradient>
                <radialGradient id="atlas-aurora" cx="62%" cy="24%" r="45%">
                  <stop offset="0%" stopColor="#233680" stopOpacity="0.55" />
                  <stop offset="100%" stopColor="#233680" stopOpacity="0" />
                </radialGradient>
                <radialGradient id="atlas-ember" cx="30%" cy="78%" r="38%">
                  <stop offset="0%" stopColor="#3a2340" stopOpacity="0.6" />
                  <stop offset="100%" stopColor="#3a2340" stopOpacity="0" />
                </radialGradient>
                <filter id="pin-glow" x="-80%" y="-80%" width="260%" height="260%">
                  <feGaussianBlur stdDeviation="5" result="b" />
                  <feMerge>
                    <feMergeNode in="b" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
              </defs>
              <rect width={W} height={H} fill="url(#atlas-sky)" />
              <rect width={W} height={H} fill="url(#atlas-aurora)" />
              <rect width={W} height={H} fill="url(#atlas-ember)" />
              {stars.map((s, i) => (
                <circle key={i} cx={s.x} cy={s.y} r={s.r} fill="#cfe0ff" opacity={s.o} />
              ))}
              {/* fine graticule, under the stars */}
              <g stroke="#8b95ff" strokeOpacity="0.08" strokeWidth="1">
                {[0.2, 0.35, 0.5, 0.65, 0.8].map((f) => (
                  <line key={`h-${f}`} x1="0" x2={W} y1={H * f} y2={H * f} strokeDasharray="2 7" />
                ))}
                {[0.2, 0.35, 0.5, 0.65, 0.8].map((f) => (
                  <line key={`v-${f}`} y1="0" y2={H} x1={W * f} x2={W * f} strokeDasharray="2 7" />
                ))}
              </g>
              {/* ley lines: nearest-neighbour edges, fading by distance */}
              <g strokeLinecap="round">
                {edges.map(([a, b], i) => {
                  const pa = pts[a]!;
                  const pb = pts[b]!;
                  const d = Math.hypot(pa.x - pb.x, pa.y - pb.y);
                  const o = Math.max(0.08, Math.min(0.4, 0.42 - d / 620));
                  return <line key={i} data-atlas-edge={`${a}-${b}`} x1={pa.x} y1={pa.y} x2={pb.x} y2={pb.y} stroke="#6f7bf5" strokeOpacity={o} strokeWidth="1.2" />;
                })}
              </g>
              {pins.map((pin, i) => {
                const p = pts[i]!;
                const isSelected = selected && selected.id === pin.id;
                const isGeo = pin.kind === 'geography';
                const ring = isSelected ? '#22d3ee' : isGeo ? '#8b95ff' : '#f0b35a';
                return (
                  <a
                    key={pin.id}
                    href={`/world/${projectId}/atlas?pin=${encodeURIComponent(pin.id)}`}
                    data-atlas-pin={pin.id}
                    data-atlas-kind={pin.kind}
                    aria-pressed={isSelected ? true : false}
                    aria-label={`${pin.kindLabel}：${pin.title}`}
                    className="atl-pinLink"
                  >
                    <g transform={`translate(${p.x} ${p.y})`} filter="url(#pin-glow)" className="atl-pinGlyph">
                      {isGeo ? (
                        <>
                          <circle r={isSelected ? 11 : 8.5} fill="#0e1434" stroke={ring} strokeWidth={isSelected ? 2.4 : 1.6} />
                          <circle r="2.6" fill={ring} />
                        </>
                      ) : (
                        <>
                          <rect x={isSelected ? -8.6 : -6.8} y={isSelected ? -8.6 : -6.8} width={isSelected ? 17.2 : 13.6} height={isSelected ? 17.2 : 13.6} transform="rotate(45)" fill="#171029" stroke={ring} strokeWidth={isSelected ? 2.4 : 1.6} />
                          <path d="M 0 -3.6 L 0 3.6 M -3.6 0 L 3.6 0" stroke={ring} strokeWidth="1.3" />
                        </>
                      )}
                    </g>
                    <text x={p.x} y={p.y + (isGeo ? 22 : 24)} textAnchor="middle" fill={isSelected ? '#eef0ff' : '#aab2d8'} fontSize="10.5" fontFamily="var(--nexus-font-sans, system-ui)" className="atl-pinLabel">
                      {pin.title.length > 9 ? `${pin.title.slice(0, 9)}…` : pin.title}
                    </text>
                  </a>
                );
              })}
            </svg>
            <figcaption className="atl-caption">
              <span>{c.caption(geography.length, factions.length)}</span>
              <span className="atl-legend">
                <span className="atl-legendItem"><span className="atl-dotGeo" />{c.legendGeo}</span>
                <span className="atl-legendItem"><span className="atl-dotFaction" />{c.legendFaction}</span>
                <span className="atl-legendItem"><span className="atl-legendLine" />{c.legendLey}</span>
              </span>
            </figcaption>
          </figure>

          <aside className="atl-aside">
            <section className="atl-panel" data-atlas-ledger>
              <div className="atl-panelHead">
                <h2 className="atl-panelTitle">{c.starLedger}</h2>
                <span className="atl-panelCount">{c.pinsCount(pins.length)}</span>
              </div>
              <div className="atl-ledgerList">
                {pins.map((pin) => {
                  const isSelected = selected && selected.id === pin.id;
                  return (
                    <a
                      key={pin.id}
                      href={`/world/${projectId}/atlas?pin=${encodeURIComponent(pin.id)}`}
                      data-atlas-ledger-row={pin.id}
                      aria-current={isSelected ? 'true' : undefined}
                      className={`atl-ledgerRow${isSelected ? ' atl-ledgerRowOn' : ''}`}
                    >
                      <span className={pin.kind === 'geography' ? 'atl-ledgerKindGeo' : 'atl-ledgerKindFaction'}>{pin.kindLabel}</span>
                      <span className="atl-ledgerTitle">{pin.title}</span>
                    </a>
                  );
                })}
              </div>
            </section>

            <section className="atl-detail" data-atlas-detail aria-live="polite">
              {selected ? (
                <>
                  <p className="atl-detailKind">{c.detailKind(selected.kindLabel)}</p>
                  <h3 className="atl-detailTitle">{selected.title}</h3>
                  {selected.body ? <p className="atl-detailBody">{selected.body}</p> : <p className="atl-detailEmpty">{c.entryUntitled}</p>}
                  <p className="atl-detailMeta">{c.recorded(selected.updatedAt.slice(0, 10))}</p>
                </>
              ) : (
                <p className="atl-detailEmpty">{c.selectEmpty}</p>
              )}
            </section>
          </aside>
        </div>
      )}
    </main>
  );
}
