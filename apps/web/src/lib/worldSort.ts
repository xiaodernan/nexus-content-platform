/** 世界条目排序：纯函数、稳定、不碰文档本体（只投影视图顺序）。 */
import type { WorldNode } from '@nexus/world-model';

export type WorldSortMode = 'insertion' | 'era' | 'title';

export function sortWorldNodes(nodes: readonly WorldNode[], mode: WorldSortMode): WorldNode[] {
  const indexed = nodes.map((node, i) => ({ node, i }));
  if (mode === 'insertion') return nodes.map((n) => ({ ...n }));
  indexed.sort((a, b) => {
    if (mode === 'title') {
      const c = a.node.title.localeCompare(b.node.title, 'zh-Hans-CN');
      return c !== 0 ? c : a.i - b.i;
    }
    const ea = a.node.lore?.era?.trim() ?? '';
    const eb = b.node.lore?.era?.trim() ?? '';
    if (ea !== eb) {
      if (!ea) return 1;   // 未标纪元的排在有纪元的后面
      if (!eb) return -1;
      return ea.localeCompare(eb, 'zh-Hans-CN');
    }
    const oa = a.node.lore?.order ?? Number.MAX_SAFE_INTEGER;
    const ob = b.node.lore?.order ?? Number.MAX_SAFE_INTEGER;
    if (oa !== ob) return oa - ob;
    return a.i - b.i;
  });
  return indexed.map((x) => ({ ...x.node }));
}
