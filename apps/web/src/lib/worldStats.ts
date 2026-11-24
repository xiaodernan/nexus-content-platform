/**
 * 世界规模读数：纯投影，零 provider、零写库。
 * 用户要"世界无穷大、细节包罗万象"——先把已有体量诚实量出来，不伪造进度。
 */
import { WORLD_KINDS, type WorldDocument } from '@nexus/world-model';

export type WorldStats = {
  kinds: number;          // 九类里的总类数
  filledKinds: number;    // 至少一条有正文的类数
  entries: number;
  filledEntries: number;  // body 非空的条目数
  links: number;
  eras: number;
  echoes: number;         // 有 memory 的条目数
  fillRate: number | null;// 没有条目时给 null，不画 0%
};

export function worldStats(world: WorldDocument): WorldStats {
  const nodes = world.nodes || [];
  const filled = nodes.filter((n) => (n.body || '').trim().length > 0);
  const kindsFilled = new Set(filled.map((n) => n.kind));
  return {
    kinds: WORLD_KINDS.length,
    filledKinds: kindsFilled.size,
    entries: nodes.length,
    filledEntries: filled.length,
    links: (world.links || []).length,
    eras: new Set(nodes.map((n) => n.lore?.era?.trim()).filter(Boolean)).size,
    echoes: nodes.filter((n) => (n.lore?.memory || '').trim().length > 0).length,
    fillRate: nodes.length === 0 ? null : filled.length / nodes.length,
  };
}

export function formatWorldStats(s: WorldStats, locale: 'zh' | 'en'): string {
  const pct = s.fillRate === null
    ? (locale === 'zh' ? '还没有条目' : 'no entries yet')
    : `${Math.round(s.fillRate * 100)}%`;
  return locale === 'zh'
    ? `${s.filledKinds}/${s.kinds} 类有正文 · ${s.filledEntries}/${s.entries} 条 · ${s.links} 条关系 · ${s.eras} 个纪元 · ${s.echoes} 枚回声 · 填充 ${pct}`
    : `${s.filledKinds}/${s.kinds} sections with content · ${s.filledEntries}/${s.entries} entries · ${s.links} links · ${s.eras} eras · ${s.echoes} echoes · filled ${pct}`;
}
