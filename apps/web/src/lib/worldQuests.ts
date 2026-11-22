/**
 * §WORLD-QUEST · 世界委托（/world/<id>/quests）——把世界的**真实缺口**投影成一张可动手的委托板。
 *
 * 三条纪律，和 §WORLD-NET / §v719-Tide 同一流派：
 * 1. **零 provider、零写库、零随机**：所有数字来自 WorldDocument + Character[] 的真字段；
 *    读不出来就如实留白，绝不编一条"任务"出来（§159）。
 * 2. **同输入永远同输出**：排序全部用 (count desc, kind asc) 与 (label asc, id asc) 兜底；
 *    「今日委托」只由 `世界 id + 日期(UTC+8)` 的 FNV-1a 哈希决定，没有 Math.random。
 * 3. **数字与 /integrity 同口径**：同一批条目在两个页面报的缺口数必须相同；
 *    纪元未标用 buildChronicle 的归一化结果，图上的孤岛/关节用 buildWorldNetwork 的结果。
 *
 * 委托不是"游戏积分"：没有分数、没有等级、没有假进度。一个 kind 的 count 归零就真的从板上消失，
 * 出现在「已经了结」里；对应内容还没开始时它也不假装已完成，而是落到「还没有可做的东西」。
 */

import type { Character, WorldDocument, WorldNode } from '@nexus/world-model';
import { buildChronicle, UNLABELED_ERA } from './chronicle';
import { buildConstellation } from './constellation';
import { buildWorldNetwork } from './worldNetwork';

export const WORLD_QUEST_KINDS = [
  'skeleton',
  'thin',
  'untagged',
  'order-clash',
  'unresolved',
  'isolated',
  'cut-vertex',
  'empty-palette',
] as const;

export type WorldQuestKind = (typeof WORLD_QUEST_KINDS)[number];

/** 薄节点阈值：与 /integrity、tide 的 erosion 同一口径（120 字） */
export const THIN_BODY_LIMIT = 120;

export interface QuestSample {
  /** 稳定标识：节点/人物 id，或「甲 → 乙」这样的关系标签（无 id 时用标签） */
  id: string;
  label: string;
}

export interface QuestSlot {
  kind: WorldQuestKind;
  count: number;
  /** false = 这一类现在没有可做的对象（例如还没有任何人物）——不当作「已完成」 */
  applicable: boolean;
  /** 最多 3 条真实样例，用来证明这个数字不是编的 */
  samples: QuestSample[];
}

export interface QuestBoard {
  /** UTC+8 的日期键 YYYY-MM-DD */
  day: string;
  /** 今日委托：从 open 里按日期哈希轮转取前 3（不足 3 就全部） */
  focus: QuestSlot[];
  /** 其余可做的事（open 去掉 focus，保持同一轮转顺序） */
  rest: QuestSlot[];
  /** 还有缺口的全部项（count desc, kind asc） */
  open: QuestSlot[];
  /** 曾经适用、现在计数为 0 的项——真的了结了 */
  closed: QuestSlot[];
  /** 现在还不适用的项（还没有人物 / 还没有关系……），不冒充完成 */
  notStarted: QuestSlot[];
  /** 世界文档一个节点都没有：页面要引导落第一条，而不是报「8 项全部完成」 */
  emptyWorld: boolean;
}

const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** FNV-1a 32 位哈希：只用来决定今日委托的起点，不是安全哈希。 */
export function fnv1a32(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** 委托日：固定 UTC+8（用户所在时区），跨机器同一天得到同一个键。 */
export function questDayKey(now: Date = new Date()): string {
  return new Date(now.getTime() + 8 * 3600 * 1000).toISOString().slice(0, 10);
}

function samplesOf(entries: readonly { id: string; label: string }[]): QuestSample[] {
  return entries
    .slice()
    .sort((a, b) => cmp(a.label, b.label) || cmp(a.id, b.id))
    .slice(0, 3)
    .map((entry) => ({ id: entry.id, label: entry.label }));
}

function slot(
  kind: WorldQuestKind,
  count: number,
  applicable: boolean,
  entries: readonly { id: string; label: string }[] = [],
): QuestSlot {
  return { kind, count: applicable ? count : 0, applicable, samples: applicable ? samplesOf(entries) : [] };
}

export interface QuestBoardInput {
  projectId: string;
  document: WorldDocument;
  characters: readonly Character[];
  now?: Date;
  focusSize?: number;
}

export function buildQuestBoard(input: QuestBoardInput): QuestBoard {
  const { projectId, document, characters } = input;
  const nodes: readonly WorldNode[] = document.nodes;
  const day = questDayKey(input.now ?? new Date());
  const focusSize = Math.max(1, Math.min(3, Math.floor(input.focusSize ?? 3)));

  const authored = nodes.filter((node) => node.body.trim().length > 0);
  const thin = authored.filter((node) => node.body.trim().length < THIN_BODY_LIMIT);

  const eras = buildChronicle(nodes);
  const untaggedEntries = eras.find((era) => era.era === UNLABELED_ERA)?.entries ?? [];

  // order 撞号：与 /integrity 逐字同口径——story/history 里 (era, order) 相同的多余条目。
  const orderBuckets = new Map<string, { id: string; label: string }[]>();
  for (const node of nodes) {
    if (node.kind !== 'story' && node.kind !== 'history') continue;
    const order = node.lore?.order;
    if (order === undefined || order === null) continue;
    const key = `${node.lore?.era ?? ''}|${order}`;
    const bucket = orderBuckets.get(key) ?? [];
    bucket.push({ id: node.id, label: node.title || node.id });
    orderBuckets.set(key, bucket);
  }
  const orderClashSamples: { id: string; label: string }[] = [];
  let orderClash = 0;
  for (const bucket of orderBuckets.values()) {
    orderClash += Math.max(0, bucket.length - 1);
    // 同一桶里的第一条不算撞号；其余都是"多出来的那一行"
    orderClashSamples.push(...bucket.slice(1));
  }
  const orderCandidates = nodes.filter(
    (node) => (node.kind === 'story' || node.kind === 'history') && node.lore?.order !== undefined && node.lore?.order !== null,
  ).length;

  const graph = buildConstellation(
    characters,
    nodes.map((node) => ({ id: node.id, title: node.title })),
  );
  const network = buildWorldNetwork(document);
  const titleOf = new Map(nodes.map((node) => [node.id, node.title || node.id] as const));

  const emptyPalette = characters.filter((char) => (char.profile.visualIdentity.palette ?? []).length === 0);

  const slots: QuestSlot[] = [
    slot('skeleton', nodes.length - authored.length, nodes.length > 0,
      nodes.filter((node) => node.body.trim().length === 0).map((node) => ({ id: node.id, label: node.title || node.id }))),
    slot('thin', thin.length, authored.length > 0,
      thin.map((node) => ({ id: node.id, label: node.title || node.id }))),
    slot('untagged', untaggedEntries.length, untaggedEntries.length > 0 || nodes.some((n) => n.kind === 'story' || n.kind === 'history'),
      untaggedEntries.map((entry) => ({ id: entry.id, label: entry.title || entry.id }))),
    slot('order-clash', orderClash, orderCandidates > 0, orderClashSamples),
    slot('unresolved', graph.unresolved.length, graph.totalRelationships > 0,
      graph.unresolved.map((rel) => ({ id: `${rel.ownerId}\u0000${rel.target}`, label: `${rel.ownerName} → ${rel.target}` }))),
    slot('isolated', network.isolated.length, nodes.length > 1,
      network.isolated.map((id) => ({ id, label: titleOf.get(id) ?? id }))),
    slot('cut-vertex', network.cutVertices.length, network.linkCount > 0,
      network.cutVertices.map((vertex) => ({ id: vertex.id, label: titleOf.get(vertex.id) ?? vertex.id }))),
    slot('empty-palette', emptyPalette.length, characters.length > 0,
      emptyPalette.map((char) => ({ id: char.id, label: char.profile.name || char.id }))),
  ];

  const kindOrder = new Map(WORLD_QUEST_KINDS.map((kind, i) => [kind, i] as const));
  const open = slots
    .filter((entry) => entry.applicable && entry.count > 0)
    .sort((a, b) => b.count - a.count || (kindOrder.get(a.kind) ?? 0) - (kindOrder.get(b.kind) ?? 0));
  const closed = slots
    .filter((entry) => entry.applicable && entry.count === 0)
    .sort((a, b) => (kindOrder.get(a.kind) ?? 0) - (kindOrder.get(b.kind) ?? 0));
  const notStarted = slots
    .filter((entry) => !entry.applicable)
    .sort((a, b) => (kindOrder.get(a.kind) ?? 0) - (kindOrder.get(b.kind) ?? 0));

  // 今日委托：轮转起点由 world id + 日期决定——同一天同一世界永远同一组，跨天自然换一批。
  const start = open.length > 0 ? fnv1a32(`${projectId}|${day}`) % open.length : 0;
  const rotated = [...open.slice(start), ...open.slice(0, start)];
  const focus = rotated.slice(0, Math.min(focusSize, rotated.length));
  const rest = rotated.slice(focus.length);

  return { day, focus, rest, open, closed, notStarted, emptyWorld: nodes.length === 0 };
}
