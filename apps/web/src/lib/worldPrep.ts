/**
 * §WORLD-PREP · 新手预演（/world/<id>）——新玩法补档（第七条「教会用户怎么玩」）。
 *
 * 确定性、零 provider、零写库：每一步指向这个世界的真节点 id（占位符只替换，不编情节），
 * 模块之间的调用引用这几个函数本身（worldInquiries/worldWaypoints/worldSeasons 等）。
 */
import type { WorldDocument, WorldNode } from '@nexus/world-model';

export type PlayStepKind = 'enter' | 'explore' | 'use';

export interface PlayStep {
  id: string;
  kind: PlayStepKind;
  /** 中文台词（0-provider：从真节点 title 拼） */
  label: string;
  /** 引用的函数名/模块（按真事实，约定） */
  tool: string;
}

function hashSeed(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return (h || 1) >>> 0;
}

/** 预演步骤：先点入 ≥2 个节点，再用这几函数；节点不足 2 个就只给进入/第一步。 */
export function buildPlaythrough(world: WorldDocument, maxSteps = 8): PlayStep[] {
  if (!world || !world.nodes) return [];
  const nodes = world.nodes.filter((n) => n.id && n.title.trim().length > 0);
  const seed = hashSeed(world.id);
  const pick = (k: number, i: number) => nodes[(seed + k * 7 + i) % nodes.length];
  const out: PlayStep[] = [
    { id: 'enter-0', kind: 'enter', label: `打开世界 ${world.name}（节点 ${nodes[0]?.title ?? '—'}）` , tool: '' },
  ];
  if (nodes.length < 2) return out.slice(0, maxSteps);
  out.push({ id: 'exp-0', kind: 'explore', label: `按 worldInquiries 的线索追寻 ${nodes[1]!.title}`, tool: 'worldInquiries.buildWorldInquiries' });
  out.push({ id: 'way-0', kind: 'use', label: `用 worldWaypoints 规划去 ${nodes[2]?.title ?? nodes[0]!.title} 的路` , tool: 'worldWaypoints.buildWorldWaypoints' });
  out.push({ id: 'sea-0', kind: 'use', label: `看 worldSeasons 新现在在这个赛季`, tool: 'worldSeasons.seasonAtDay' });
  out.push({ id: 'exp-1', kind: 'explore', label: `用 worldEchoWalk 重新走一趟回响步道`, tool: 'worldEchoWalk.buildEchoWalk' });
  return out.slice(0, maxSteps);
}
