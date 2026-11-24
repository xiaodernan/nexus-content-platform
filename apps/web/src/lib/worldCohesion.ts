/**
 * 世界连通度：纯投影，零 provider、零写库、零随机。
 * 用户要"世界无穷大、细节包罗万象，但别看着很大里面很空"——把关系网的真实稀疏度量出来，
 * 不打分、不伪造健康；数字全部来自 buildWorldNetwork 的既有口径。
 */
import type { WorldDocument } from '@nexus/world-model';
import { buildWorldNetwork } from './worldNetwork';

export type WorldCohesion = {
  nodes: number;
  links: number;
  isolated: number;
  components: number;
  /** 有关系沾到的条目占比（0–1）；没有条目时 null，不画 0% */
  touched: number | null;
};

export function worldCohesion(world: WorldDocument): WorldCohesion {
  const net = buildWorldNetwork(world);
  const nodes = net.nodeCount;
  return {
    nodes,
    links: net.linkCount,
    isolated: net.isolated.length,
    components: net.weakComponents,
    touched: nodes === 0 ? null : (nodes - net.isolated.length) / nodes,
  };
}

export function formatWorldCohesion(c: WorldCohesion, locale: 'zh' | 'en'): string {
  const pct = c.touched === null
    ? (locale === 'zh' ? '还没有条目' : 'no entries yet')
    : `${Math.round(c.touched * 100)}%`;
  if (locale === 'zh') {
    return `连通度：${c.nodes} 条中 ${pct} 有关系 · ${c.links} 条关系 · ${c.components} 个连通块 · ${c.isolated} 个孤岛${c.isolated > 0 ? '（用「串联建议」或「一键织网」连起来）' : ''}`;
  }
  return `Cohesion: ${pct} of ${c.nodes} entries connected · ${c.links} links · ${c.components} components · ${c.isolated} isolated${c.isolated > 0 ? ' (use hints or weave-all to connect them)' : ''}`;
}
