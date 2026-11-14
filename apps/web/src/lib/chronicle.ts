/**
 * 「世界编年」（v705 / ROADMAP）—— 从世界文档的 story/history 条目里推导编年：
 *
 * - 纪元分组键：`lore.era`（自由文本，trim 后非空才算）；缺失 ⇒ 归"未标纪元"（排最后一档）
 * - 纪元顺序：每档纪元的最小 `order`（缺省视作 MAX_SAFE_INTEGER）升序——第一个纪元是最早；
 *   未标纪元永远殿后；纪元内部按 `(order ?? MAX) asc, updatedAt desc, id asc` 稳定排列
 * - 只有 story / history 进编年：quests / geography / factions 等是"空间"，不是"时间"
 * - 文理不全（空标题/非法 kind/updatedAt 非法）直接不上图——与 validateWorld 同一口径
 * - 零依赖、纯函数、同输入永远同输出
 */

import { WORLD_KIND_LABELS, type WorldKind } from '@nexus/world-model';

export const UNLABELED_ERA = '未标纪元';
const MAX_ORDER = Number.MAX_SAFE_INTEGER;

export interface ChronicleEntry {
  id: string;
  title: string;
  kind: WorldKind;
  kindLabel: string;
  era: string;          // 归一化后的纪元名（空白/未设置 → UNLABELED_ERA）
  order: number;        // 归一化序号（缺省 = MAX）
  memory?: string;      // 记忆回声，可选
  updatedAt: string;
}

export interface ChronicleEra {
  /** 归一化纪元名（UNLABELED_ERA 表示没有标过纪元的那一档） */
  era: string;
  /** 本档最小 order（排序用；未标纪元固定 MAX） */
  minOrder: number;
  entries: ChronicleEntry[];
}

export interface ChronicleNodeInput {
  id: string;
  kind: string;
  title: string;
  updatedAt: string;
  lore?: { era?: string; order?: number; memory?: string };
}

const CHRONICLE_KINDS: ReadonlySet<string> = new Set(['story', 'history']);

export function buildChronicle(nodes: readonly ChronicleNodeInput[]): ChronicleEra[] {
  const seen = new Set<string>();
  const valid: ChronicleEntry[] = [];
  for (const node of nodes) {
    if (!node || typeof node.id !== 'string' || !node.id) continue;
    if (seen.has(node.id)) continue;
    if (typeof node.kind !== 'string' || !CHRONICLE_KINDS.has(node.kind)) continue;
    const kind = node.kind as WorldKind;
    if (typeof node.title !== 'string' || !node.title.trim()) continue;
    if (typeof node.updatedAt !== 'string' || Number.isNaN(Date.parse(node.updatedAt))) continue;
    seen.add(node.id);
    const lore = node.lore;
    const eraRaw = typeof lore?.era === 'string' ? lore.era.trim() : '';
    const order = lore && Number.isInteger(lore.order) && (lore.order as number) >= 0 ? (lore.order as number) : MAX_ORDER;
    const memoryRaw = typeof lore?.memory === 'string' ? lore.memory.trim() : '';
    valid.push({
      id: node.id,
      title: node.title.trim(),
      kind,
      kindLabel: WORLD_KIND_LABELS[kind] ?? kind,
      era: eraRaw === '' ? UNLABELED_ERA : eraRaw,
      order,
      ...(memoryRaw ? { memory: memoryRaw.slice(0, 240) } : {}),
      updatedAt: node.updatedAt,
    });
  }

  // 按纪元分桶
  const buckets = new Map<string, ChronicleEntry[]>();
  for (const entry of valid) {
    const list = buckets.get(entry.era);
    if (list) list.push(entry);
    else buckets.set(entry.era, [entry]);
  }

  const eras: ChronicleEra[] = [...buckets.entries()].map(([era, entries]) => {
    entries.sort(
      (a, b) => a.order - b.order || Date.parse(b.updatedAt) - Date.parse(a.updatedAt) || a.id.localeCompare(b.id),
    );
    const minOrder = entries.reduce((acc, e) => Math.min(acc, e.order), MAX_ORDER);
    return { era, minOrder, entries };
  });

  eras.sort((a, b) => a.minOrder - b.minOrder || a.era.localeCompare(b.era));
  // 未标纪元永远殿后
  const unlabeled = eras.findIndex((e) => e.era === UNLABELED_ERA);
  if (unlabeled !== -1 && unlabeled !== eras.length - 1) {
    const [last] = eras.splice(unlabeled, 1);
    eras.push(last!);
  }
  return eras;
}

/** 线性进度：本纪元内它排第几——"灯火还剩 9 / 14 盏" 的口径，给年表卡片用 */
export function eraProgress(eras: readonly ChronicleEra[], eraIndex: number, entryIndex: number): { current: number; total: number } | null {
  const era = eras[eraIndex];
  if (!era || era.entries.length === 0 || entryIndex < 0 || entryIndex >= era.entries.length) return null;
  return { current: entryIndex + 1, total: era.entries.length };
}
