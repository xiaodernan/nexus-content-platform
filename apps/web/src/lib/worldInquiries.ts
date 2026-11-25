/**
 * §WORLD-INQUIRY · 世界线索（/world/<id>）——新玩法：把世界自身的条目重组成一串可追寻的线索。
 *
 * 纪律，与 §WORLD-FATE 同一流派：
 * 1. **零 provider、零写库、零 Math.random**：种子只取 `world.id` 的哈希与世界内节点 id，
 *    线索的每一个可指认名词（label）都来自这个世界的真 `WorldNode.title`，结论引用真节点 id。
 * 2. **同输入永远同输出**：LCG（确定性）+ Fisher–Yates，同一世界 id 同顺序永远同一列表。
 * 3. **没有分数、没有假进度**：线索按 `found` 集合逐条确认，`complete` 只在全线索确认后为真。
 */
import type { WorldDocument, WorldNode } from '@nexus/world-model';

export type InquiryKind = 'riddle' | 'absence' | 'reappearance' | 'echo';
export const INQUIRY_KINDS: readonly InquiryKind[] = ['riddle', 'absence', 'reappearance', 'echo'];

export interface InquiryClue {
  /** 线索指向的节点 id（或该节点自身），调用方把它交进 `found` */
  id: string;
  kind: InquiryKind;
  /** 真名词：取自该节点的 WorldNode.title */
  label: string;
  source: 'node';
}

export interface Inquiry {
  id: string;
  /** 引子：取自真节点的标题/正文片段（不是编出来的情节） */
  hook: string;
  clues: InquiryClue[];
  /** 结论：引用真节点 id，调用方据此收尾 */
  resolution: string;
  targetNodeIds: string[];
  seed: number;
}

/** 确定性 LCG（FNV 种子 + LCG），与 worldFate 同一构造，便于以后统一一套随机源。 */
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

/** 排序不改原数组；Fisher–Yates，与 LCG 同源，整个模块唯一随机来源。 */
function shuffle<T>(arr: readonly T[], next: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

const findNode = (world: WorldDocument, id: string): WorldNode | undefined =>
  world.nodes.find((n) => n.id === id);

const kindFor = (i: number): InquiryKind => INQUIRY_KINDS[i % INQUIRY_KINDS.length]!;

/**
 * 从世界里挖出最多 `max` 条线索。线索的候选池只有这个世界的节点（id、kind、title、body 都是真字段），
 * 无法解释时如实留白，绝不编解释（§WORLD-QUESTS 同规则）。
 */
export function buildWorldInquiries(world: WorldDocument, max = 8): Inquiry[] {
  if (!world || !world.nodes) return [];
  const usable = world.nodes.filter((n) => n.id && (n.body || '').trim().length > 60 && n.title.trim().length > 0);
  if (usable.length < 2) return [];
  const next = rng(hashSeed(world.id) ^ usable.length);
  const order = shuffle(usable, next);
  const inquiries: Inquiry[] = [];
  for (let i = 0; i < Math.min(max, order.length); i++) {
    const n = order[i]!;
    const pool = shuffle(order.filter((m) => m.id !== n.id), next).slice(0, 4);
    const targetNodeIds = [n.id, ...pool.map((m) => m.id)].slice(0, 5);
    const clues = targetNodeIds
      .map((id, j) => findNode(world, id))
      .filter((node): node is WorldNode => !!node)
      .slice(0, 4)
      .map((node, j): InquiryClue => ({ id: node.id, kind: kindFor(j), label: node.title, source: 'node' }));
    const hook = `从【${n.title}】的余波出发：${(n.body.slice(0, 60) + '…').trim()}`;
    inquiries.push({
      id: `inq-${n.id}`,
      hook,
      clues,
      resolution: `线索在 ${n.title}（节点 ${n.id}）闭合，共 ${clues.length} 条可确认。`,
      targetNodeIds: targetNodeIds.slice(0, clues.length),
      seed: (hashSeed(world.id) + i) >>> 0,
    });
  }
  return inquiries;
}

export interface InquiryProgress {
  inquiry: Inquiry;
  found: number;
  total: number;
  complete: boolean;
}

/** 按调用方通报的 `found` 集合逐条确认：完整才算 complete。 */
export function completeInquiry(inquiry: Inquiry, found: ReadonlySet<string>): InquiryProgress {
  const ok = inquiry.clues.filter((c) => found.has(c.id));
  return { inquiry, found: ok.length, total: inquiry.clues.length, complete: ok.length === inquiry.clues.length };
}

/** 按世界 id 序取第 idx 条线索（序号不存在返回 null）。 */
export function playInquiry(world: WorldDocument, idx: number): Inquiry | null {
  const inquiries = buildWorldInquiries(world);
  const i = inquiries[idx];
  return i ?? null;
}
