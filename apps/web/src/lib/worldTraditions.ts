/**
 * §WORLD-TRADITIONS · 世界传统（/world/<id>）——新玩法补档（第六条「细节包罗万象」）。
 *
 * 纪律：零 provider、零写库、零 Math.random；每个节庆的名字/出处都从世界真节点 title 拼出，
 * 周期由 world.id 的哈希确定，不编历史、不写进度。
 */
import type { WorldDocument, WorldNode } from '@nexus/world-model';

export interface Tradition {
  id: string;
  /** 节庆名：从真节点标题拼，无额外编造 */
  name: string;
  /** 起点真节点 id */
  originNodeId: string;
  /** 每 UTC 天里的第几天出现（0-6） */
  weekday: number;
  /** 发生方式，由起点节点 kind 投影，不是编造 */
  rite: '纪念' | '游行' | '静默' | '问答';
}

function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return (h || 1) >>> 0;
}

const RITES: readonly Tradition['rite'][] = ['纪念', '游行', '静默', '问答'];

/** 从世界真节点生成最多 max 条节庆（节点不足 1 → []）。 */
export function buildWorldTraditions(world: WorldDocument, max = 6): Tradition[] {
  if (!world || !world.nodes) return [];
  const usable = world.nodes.filter((n) => n.id && n.title.trim().length > 0);
  if (!usable.length) return [];
  const seed = hash(world.id);
  const out: Tradition[] = [];
  for (let i = 0; i < Math.min(max, usable.length); i++) {
    const n: WorldNode = usable[(seed + i * 3) % usable.length]!;
    out.push({
      id: `trad-${n.id}`,
      name: `${n.title}之节`,
      originNodeId: n.id,
      weekday: (seed + i) % 7,
      rite: RITES[(seed + i * 3) % RITES.length]!,
    });
  }
  return out;
}

/** 指定 weekday 正在过的节庆；没有就返回 []（不补位）。 */
export function traditionsOnDay(world: WorldDocument, weekday: number): Tradition[] {
  if (!Number.isFinite(weekday) || weekday < 0 || weekday > 6) return [];
  return buildWorldTraditions(world).filter((t) => t.weekday === weekday);
}
