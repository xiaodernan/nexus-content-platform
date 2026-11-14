/**
 * 世界切片 · Ephemeris——按真实世界文档确定性演算"这一年的每一天"。
 *
 * 设计约束：
 * - 零 provider、零 IO、零日期副作用：同一份世界文档给出完全相同的一年；
 * - 只读投影，零写库；
 * - 每一条故事线是一个真实节点（body 非空）的登台，从不补缀它的文本；
 * - 创世年 360 天，按九类按自然顺序轮转呈现（不是随机缺省）；
 * - 节选只取节点 body 的第一句（或整句截断 96 字）——属于作者的原话，不是我们替他说话。
 */

import { WORLD_KIND_LABELS, WORLD_KINDS, type WorldKind } from '@nexus/world-model';

export const EPHEMERIS_DAYS = 360;

export interface EphemerisEntry {
  /** 1–360 */
  day: number;
  id: string;
  kind: WorldKind;
  kindLabel: string;
  title: string;
  /** 来自该节点 body 的第一句（截断到 96 字）。body 为空节点不进曲目。 */
  excerpt: string;
  era: string | null;
}

export interface EphemerisNodeInput {
  id: string;
  kind: string;
  title: string;
  body: string;
  lore?: { era?: string; order?: number } | null;
}

const SENTENCE_END = /[。！？!?]|(?<=[.])(?=\s|$)/;

/** 取第一句话；超长按 96 字截断。没听见句号就取整段（但截断到 96 字）。 */
function pickExcerpt(body: string): string {
  const flat = body.replace(/\s+/g, ' ').trim();
  if (flat.length === 0) return '';
  const match = flat.match(SENTENCE_END);
  const raw = match && match.index !== undefined ? flat.slice(0, match.index + match[0].length) : flat;
  const trimmed = raw.trim();
  return trimmed.length > 96 ? `${trimmed.slice(0, 96)}…` : trimmed;
}

/** xorshift32 风格的确定性离心散列——同一字符串永远同一数。 */
function hash32(input: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

/** 从 [0,1) 均匀（三条均匀分区交错取值，避开 "% 360 == 0 全部落在 1"）。 */
function ratio(hash: number): number {
  // xorshift32
  let x = hash >>> 0 || 1;
  x ^= x << 13; x >>>= 0;
  x ^= x >>> 17; x >>>= 0;
  x ^= x << 5; x >>>= 0;
  return x / 0xffffffff;
}

export function buildEphemeris(nodes: readonly EphemerisNodeInput[]): EphemerisEntry[] {
  // authored only；不动骨架（空 body 不是故事）。
  const authored = nodes.filter((n) => {
    if (!n || typeof n.id !== 'string' || n.id.length === 0) return false;
    if (typeof n.body !== 'string') return false;
    return n.body.trim().length > 0;
  });
  const kindRank = new Map<WorldKind, number>(WORLD_KINDS.map((k, i) => [k, i]));

  const entries: EphemerisEntry[] = authored.map((node) => {
    const id = String(node.id);
    const kind = (node.kind as WorldKind) || 'lore';
    const day = Math.max(1, Math.min(EPHEMERIS_DAYS, Math.floor(ratio(hash32(`${id}::${node.kind}`)) * EPHEMERIS_DAYS) + 1));
    const kindLabel = WORLD_KIND_LABELS[kind] ?? kind;
    return {
      day,
      id,
      kind,
      kindLabel,
      title: node.title.trim(),
      excerpt: pickExcerpt(node.body),
      era: typeof node.lore?.era === 'string' && node.lore.era.trim() ? node.lore.era.trim() : null,
    };
  });

  // 排序：日序 → 九类自然序 → id 字典序（同天多条时可读、可复现）
  entries.sort((a, b) => a.day - b.day || (kindRank.get(a.kind) ?? 99) - (kindRank.get(b.kind) ?? 99) || a.id.localeCompare(b.id));
  return entries;
}
