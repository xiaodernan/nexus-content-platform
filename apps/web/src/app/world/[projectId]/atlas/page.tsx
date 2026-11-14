import Link from 'next/link';
import { notFound } from 'next/navigation';
import { loadWorld } from '@/server/domain/worlds';
import { loadDocument } from '@/server/domain/projects';
import { projectVisibleTo } from '@/server/domain/team';
import { requireUser } from '@/server/domain/session';
import { WORLD_KIND_LABELS, type WorldKind } from '@nexus/world-model';

export const dynamic = 'force-dynamic';

/**
 * 「寰宇图志」— 世界里的空间条目（地理 / 势力）的一张夜图。
 * 与编年（时间）、回廊（记忆）、星图（角色）是同一套投影纪律：
 * 零写库、读不到就说读不到、位置由确定性算法（黄金角螺旋 phyllotaxis）给出，
 * 同一份文档永远是同一张图。选择通过 `?pin=<id>` 查询参数驱动（SSR，零客户端状态）。
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
const GOLDEN_ANGLE = 137.508; // 度，黄金角（Phyllotaxis）
const MAX_PINS = 160;
const W = 720;
const H = 560;
const CX = W / 2;
const CY = H / 2;
const R_MAX = Math.min(W, H) / 2 - 56;

/** 确定性伪随机数：SSR 稳定，不靠 Math.random。 */
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

/** 黄金角螺旋排布：离散、无碰撞、视觉上均匀。 */
function phyllotaxis(count: number): Array<{ x: number; y: number }> {
  const points: Array<{ x: number; y: number }> = [];
  for (let i = 0; i < count; i += 1) {
    const angle = (i * GOLDEN_ANGLE * Math.PI) / 180;
    const r = R_MAX * Math.sqrt((i + 0.5) / count);
    points.push({ x: CX + r * Math.cos(angle), y: CY + r * Math.sin(angle) });
  }
  return points;
}

/** 最近邻贪心连边（无向，去重），上限 ceil(1.15n)。 */
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
  const { projectId } = await params;
  const user = await requireUser();
  if (!(await projectVisibleTo(projectId, user.id))) notFound();

  const [world, project, query] = await Promise.all([loadWorld(projectId), loadDocument(projectId), searchParams]);
  if (!project) notFound();

  const worldOk = world && world.ok ? world.document : null;
  const pins: AtlasPin[] = worldOk
    ? worldOk.nodes
        .filter((n) => ATLAS_KINDS.has(n.kind as string))
        .map((n): AtlasPin => {
          const kind = n.kind as WorldKind;
          return {
            id: n.id,
            kind,
            kindLabel: WORLD_KIND_LABELS[kind] ?? n.kind,
            title: typeof n.title === 'string' && n.title.trim() ? n.title.trim() : '（无题）',
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
    <main className="min-h-dvh bg-[#070a14] px-6 py-8 text-[#e8eaed]" data-atlas-root>
      <header className="mx-auto flex max-w-6xl flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-mono text-10 uppercase tracking-[0.22em] text-[#8b95ff]">ATLAS · {project.name}</p>
          <h1 className="mt-2 text-[var(--nexus-font-size-34)] font-bold leading-tight text-[#eef0ff]">寰宇图志</h1>
          <p className="mt-2 max-w-xl text-13 leading-6 text-[#aab2d8]">
            世界里的空间与势力，在一张夜图上星火对峙。位置由黄金角螺旋确定——同一份世界文档，每一次都摊开同一张图。
          </p>
        </div>
        <nav className="flex flex-wrap items-center gap-2" aria-label="世界子页导航">
          <Link href={`/world/${projectId}`} className="rounded-md border border-[#232b52] bg-[#0d1230]/70 px-3 py-1.5 text-11 text-[#c6cdf5] transition-colors hover:border-[#3a4472] hover:text-white">世界步行</Link>
          <Link href={`/world/${projectId}/constellation`} className="rounded-md border border-[#232b52] bg-[#0d1230]/70 px-3 py-1.5 text-11 text-[#c6cdf5] transition-colors hover:border-[#3a4472] hover:text-white">角色星图</Link>
          <Link href={`/world/${projectId}/chronicle`} className="rounded-md border border-[#232b52] bg-[#0d1230]/70 px-3 py-1.5 text-11 text-[#c6cdf5] transition-colors hover:border-[#3a4472] hover:text-white">世界编年</Link>
          <Link href={`/world/${projectId}/memories`} className="rounded-md border border-[#232b52] bg-[#0d1230]/70 px-3 py-1.5 text-11 text-[#c6cdf5] transition-colors hover:border-[#3a4472] hover:text-white">记忆回廊</Link>
        </nav>
      </header>

      {pins.length === 0 ? (
        <div className="mx-auto mt-10 max-w-3xl rounded-xl border border-[#1e2647] bg-[#0d1230]/60 p-8 text-center" data-atlas-empty>
          <p className="text-16 text-[#d6dbf5]">这片夜空还是空白。</p>
          <p className="mt-2 text-13 text-[#8b95ff]/70">去 Studio 的世界面板建立地理（geography）或势力（factions）条目，它们就会在此升起。</p>
        </div>
      ) : (
        <div className="mx-auto mt-6 flex max-w-6xl flex-col gap-6 lg:flex-row">
          <figure className="flex-1 overflow-hidden rounded-2xl border border-[#1e2647] bg-[#0b0f24]">
            <svg viewBox={`0 0 ${W} ${H}`} role="group" aria-label="寰宇图志夜图" className="block h-auto w-full" data-atlas-svg>
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
              {/* 舆图网格：细经纬，压在星下面 */}
              <g stroke="#8b95ff" strokeOpacity="0.08" strokeWidth="1">
                {[0.2, 0.35, 0.5, 0.65, 0.8].map((f) => (
                  <line key={`h-${f}`} x1="0" x2={W} y1={H * f} y2={H * f} strokeDasharray="2 7" />
                ))}
                {[0.2, 0.35, 0.5, 0.65, 0.8].map((f) => (
                  <line key={`v-${f}`} y1="0" y2={H} x1={W * f} x2={W * f} strokeDasharray="2 7" />
                ))}
              </g>
              {/* 灵脉：最近邻连边，按距离渐隐 */}
              <g strokeLinecap="round">
                {edges.map(([a, b], i) => {
                  const pa = pts[a]!;
                  const pb = pts[b]!;
                  const d = Math.hypot(pa.x - pb.x, pa.y - pb.y);
                  const o = Math.max(0.08, Math.min(0.4, 0.42 - d / 620));
                  return <line key={i} data-atlas-edge={`${a}-${b}`} x1={pa.x} y1={pa.y} x2={pb.x} y2={pb.y} stroke="#6f7bf5" strokeOpacity={o} strokeWidth="1.2" />;
                })}
              </g>
              {/* 星位 */}
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
                    className="outline-none"
                  >
                    <g transform={`translate(${p.x} ${p.y})`} filter="url(#pin-glow)" className="cursor-pointer">
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
                    <text x={p.x} y={p.y + (isGeo ? 22 : 24)} textAnchor="middle" fill={isSelected ? '#eef0ff' : '#aab2d8'} fontSize="10.5" fontFamily="var(--nexus-font-sans, system-ui)" className="select-none">
                      {pin.title.length > 9 ? `${pin.title.slice(0, 9)}…` : pin.title}
                    </text>
                  </a>
                );
              })}
            </svg>
            <figcaption className="flex flex-wrap items-center justify-between gap-3 border-t border-[#1e2647] bg-[#0b0f24] px-5 py-3 font-mono text-10 text-[#8b95ff]/80">
              <span>{geography.length} 地理 · {factions.length} 势力 · 黄金角 {GOLDEN_ANGLE}°</span>
              <span className="flex items-center gap-4"><span className="inline-flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-full border border-[#8b95ff]" />地理</span><span className="inline-flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rotate-45 border border-[#f0b35a]" />势力</span><span className="inline-flex items-center gap-1.5"><span className="inline-block h-0.5 w-5 bg-[#6f7bf5]/60" />灵脉</span></span>
            </figcaption>
          </figure>

          <aside className="flex w-full flex-col gap-4 lg:w-[360px]">
            <section className="rounded-2xl border border-[#1e2647] bg-[#0d1230]/70 p-4" data-atlas-ledger>
              <div className="mb-3 flex items-baseline justify-between">
                <h2 className="font-mono text-10 uppercase tracking-[0.2em] text-[#8b95ff]">星位名录</h2>
                <span className="font-mono text-10 text-[#8b95ff]/60">{pins.length} 座</span>
              </div>
              <div className="max-h-64 space-y-1.5 overflow-y-auto pr-1">
                {pins.map((pin) => {
                  const isSelected = selected && selected.id === pin.id;
                  return (
                    <a
                      key={pin.id}
                      href={`/world/${projectId}/atlas?pin=${encodeURIComponent(pin.id)}`}
                      data-atlas-ledger-row={pin.id}
                      aria-current={isSelected ? 'true' : undefined}
                      className={`flex items-center gap-2.5 rounded-lg border px-2.5 py-2 text-left transition-colors ${isSelected ? 'border-[#2e3a75] bg-[#141b45]' : 'border-transparent hover:border-[#232b52] hover:bg-[#101636]'}`}
                    >
                      <span className={`font-mono text-10 uppercase tracking-wider ${pin.kind === 'geography' ? 'text-[#8b95ff]' : 'text-[#f0b35a]'}`}>{pin.kindLabel}</span>
                      <span className="truncate text-12 text-[#dde2ff]">{pin.title}</span>
                    </a>
                  );
                })}
              </div>
            </section>

            <section className="rounded-2xl border border-[#1e2647] bg-[#0d1230]/70 p-5" data-atlas-detail aria-live="polite">
              {selected ? (
                <>
                  <p className="font-mono text-10 uppercase tracking-[0.2em] text-[#22d3ee]">{selected.kindLabel} 志</p>
                  <h3 className="mt-2 text-20 font-semibold leading-snug text-[#eef0ff]">{selected.title}</h3>
                  {selected.body ? <p className="mt-3 text-14 leading-7 text-[#c9ceef]">{selected.body}</p> : <p className="mt-3 text-13 text-[#8b95ff]/60">（无题志——去 Studio 补一句。）</p>}
                  <p className="mt-4 border-t border-[#1e2647] pt-3 font-mono text-10 text-[#8b95ff]/60">记录于 {selected.updatedAt.slice(0, 10)}</p>
                </>
              ) : (
                <p className="text-13 text-[#8b95ff]/60">选择一颗星位。</p>
              )}
            </section>
          </aside>
        </div>
      )}
    </main>
  );
}
