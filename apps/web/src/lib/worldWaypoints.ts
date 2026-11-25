/**
 * §WORLD-WAYPOINT · 世界远行路径（/world/<id>）——新玩法：给每个节点生成确定性的出行路径。
 *
 * 纪律与 §WORLD-INQUIRY / §WORLD-FATE 同一流派：
 * 1. **零 provider、零写库、零 Math.random**：种子只用 `world.id`，路径的可指认端点（node id）
 *    与距离/风险都是确定函数。
 * 2. **同输入永远同输出**：Fisher–Yates（LCG）+ 距离的 FNV 确定哈希，可重玩而非编造。
 * 3. **只指认真条目**：waypoint.from/to 必须是 `world.nodes` 里真实的 id；描述从两端真标题出发。
 */
import type { WorldDocument, WorldNode } from '@nexus/world-model';

export interface Waypoint {
  /** 按真 node id 组成，如 `a__b`；读方据此查节点 */
  id: string;
  fromNodeId: string;
  toNodeId: string;
  distance: number;
  risk: 'low' | 'normal' | 'high';
}

function rng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

function hashSeed(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return (h || 1) >>> 0;
}

function shuffle<T>(arr: readonly T[], next: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

/** 确定性两个真 id 的距离值：只用哈希与基数，不引入任何其它随机。 */
function distanceOf(world: WorldDocument, from: string, to: string): number {
  let h = hashSeed(`${world.id}:${from}:${to}`);
  h = Math.imul(h ^ (from.length * 31 + to.length), 5) >>> 0;
  return (50 + (h % 500)) / 10; // 5.0–54.9
}

const RISKS: readonly Waypoint['risk'][] = ['low', 'normal', 'high'];

/**
 * 为每个 `WorldNode` 生成最多 `perNode` 条出行路径（到其它真节点）。
 * 节点不足 2 个 → 返回 []；每个有结果的节点至少有 1 条（不满放弃，不编）。
 */
export function buildWorldWaypoints(world: WorldDocument, perNode = 3): Waypoint[] {
  if (!world || !world.nodes) return [];
  const usable = world.nodes.filter((n) => n.id && n.title.trim().length > 0);
  if (usable.length < 2) return [];
  // 热点纪律：全表只 shuffle 一次。早先"每节点 shuffle 全表"是 O(n²)，在 5 万节点上会卡死；
  // 现在按每节点一个环形游标取目标，复杂度 O(n·perNode)，规模冲击下仍可完成。
  waypointBuildStats.shuffles = 0;
  const order = shuffle(usable, rng(hashSeed(world.id)));
  waypointBuildStats.shuffles++;
  const result: Waypoint[] = [];
  for (const from of usable) {
    let cursor = hashSeed(from.id) % order.length;
    for (let taken = 0; taken < perNode; taken++) {
      let guard = 0;
      while (order[cursor % order.length]!.id === from.id && guard++ < order.length) cursor++;
      if (guard >= order.length) break; // 只有 1 个真节点时不应发生（前面已判 >= 2）
      const to = order[cursor++ % order.length]!;
      const distance = distanceOf(world, from.id, to.id);
      const risk = RISKS[hashSeed(`${world.id}:${from.id}:${to.id}:r`) % RISKS.length]!;
      result.push({ id: `${from.id}__${to.id}`, fromNodeId: from.id, toNodeId: to.id, distance, risk });
    }
  }
  return result;
}

/** 复杂度诊断：全表 shuffle 次数。重构前它随节点数线性增长（每节点 shuffle 全表 = O(n²)）。 */
export const waypointBuildStats = { shuffles: 0 };

/** 按 id 找路径（找不到返回 null，不猜测）。 */
export function routeBetween(world: WorldDocument, fromNodeId: string, toNodeId: string): Waypoint | null {
  const list = buildWorldWaypoints(world);
  return list.find((w) => w.fromNodeId === fromNodeId && w.toNodeId === toNodeId) ?? null;
}
