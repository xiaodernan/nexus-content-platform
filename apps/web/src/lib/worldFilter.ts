/** 世界条目过滤：纯函数、大小写不敏感、空查询返回全部（不是空）。 */
import type { WorldNode } from '@nexus/world-model';

export function filterWorldNodes(nodes: readonly WorldNode[], query: string): WorldNode[] {
  const q = query.trim().toLocaleLowerCase();
  if (!q) return [...nodes];
  return nodes.filter((n) =>
    [n.title, n.body, n.lore?.era, n.lore?.memory]
      .some((v) => typeof v === 'string' && v.toLocaleLowerCase().includes(q)),
  );
}
