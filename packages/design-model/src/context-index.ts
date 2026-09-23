/**
 * §70 Design Index / §68 design graph。
 *
 * 目的只有一个：让 Agent（和人）在**不把整份设计文档塞进上下文**（§68）的前提下，
 * 仍然知道这份设计里有什么。所以这里产出的不是文档的缩写，而是文档的**目录 + 交叉引用**：
 * 页面、结构节点、组件、资产、token、交互，外加一张只画跨引用的图
 * （树形包含关系已经在 frames 的 parent 里，不必再抄一份边）。
 *
 * 纪律（§159）：
 * - 只统计**读得出来**的东西。走不到的节点不算"不存在"，单独计数写进 totals；
 * - 不做语义检索、不做摘要、不猜重要性——那些要 provider，这里一行都不假；
 * - token 引用沿用 `collectTokenRefs`，与 lint / health 同一套算法，两处读数不许各说各话；
 * - 输出确定：目录类（组件/资产/token）按 key 排序，结构类（页面/节点/边）按文档顺序。
 */

import type {
  ComponentDefinition,
  DesignDocument,
  DesignNode,
  Page,
  SizeValue,
  Token,
} from "./types";
import { tokenRefKey } from "./tokens";
import { walk } from "./nodes";
import { collectTokenRefs } from "./validate";

export type TokenUsageVia = "binding" | "value";

export interface IndexPageEntry {
  id: string;
  name: string;
  route: string | null;
  /** 页面 nodes 表里的全部节点数 */
  nodeCount: number;
  /** 从 root 走得到的节点数；小于 nodeCount 说明有孤立节点（validate 会报 unreachable） */
  reachable: number;
  frames: number;
  sections: number;
  textChars: number;
  /** 本页用到的组件名（去重、字典序） */
  components: string[];
  /** 本页引用到的资产名（去重、字典序） */
  assets: string[];
  /** 本页引用到的 token 数（按 key 去重，含未声明的引用） */
  tokens: number;
  interactions: number;
  maxDepth: number;
  viewport: { width: number; height: number };
}

export interface IndexFrameEntry {
  id: string;
  name: string;
  /** §70 里的 Frame 这一类：只收 frame 与 section，它们才是"这页由哪几块组成" */
  kind: "frame" | "section";
  pageId: string;
  pageName: string;
  parent: string | null;
  depth: number;
  childCount: number;
  layoutMode: DesignNode["layout"]["mode"];
  size: { width: SizeValue; height: SizeValue };
  /** 这块里最早出现的一段文字，用来认出"这是 hero 还是页脚"；截断，不整段抄走 */
  textPreview: string;
}

export interface IndexComponentEntry {
  id: string;
  name: string;
  definedOnPage: string | null;
  props: string[];
  variants: number;
  slots: string[];
  /** 文档里引用了它的节点数 */
  instances: number;
  usedOnPages: string[];
  /** 一次都没被用过：写出来，别让人以为组件库全是活的 */
  unused: boolean;
}

export interface IndexAssetEntry {
  id: string;
  name: string;
  kind: string;
  /** 引用它的节点数（assetId 字段或 image paint） */
  usedByNodes: number;
  usedOnPages: string[];
  orphaned: boolean;
}

export interface IndexTokenEntry {
  key: string;
  type: string;
  group: string | null;
  /** 默认值；JSON 标量才原样给，复杂值写 "<complex>"，免得索引比文档还大 */
  value: string | number | boolean | null | "<complex>";
  /** 多主题 mode 的个数，0 表示没有 */
  modes: number;
  /** 用到它的节点数（按节点 id 去重） */
  usedByNodes: number;
  /** 从哪儿找到它的：value = 字段里写了 {token.ref}，binding = bindingsMap 显式绑定 */
  via: TokenUsageVia[];
  used: boolean;
}

export interface IndexInteractionEntry {
  id: string;
  pageId: string;
  pageName: string;
  nodeId: string;
  nodeName: string;
  trigger: string;
  action: string;
  target: string | null;
  /** target 能解析到本页节点或某个页面时给名字；解析不到就是 null，不猜 */
  targetName: string | null;
}

export type IndexEdgeKind = "instance" | "asset" | "token" | "interaction";

export interface IndexEdge {
  from: string;
  to: string;
  kind: IndexEdgeKind;
}

export interface DesignIndexTotals {
  pages: number;
  nodes: number;
  reachableNodes: number;
  /** nodes - reachable：>0 就是文档里有走不到的节点，索引如实报出来而不是忽略 */
  unreachableNodes: number;
  frames: number;
  sections: number;
  components: number;
  unusedComponents: number;
  instances: number;
  assets: number;
  orphanAssets: number;
  tokens: number;
  unusedTokens: number;
  /** 被引用却没在 token 表里声明的 key 数：漏声明是设计系统的洞，索引不替它圆场 */
  undeclaredTokenRefs: number;
  interactions: number;
  edges: number;
  textChars: number;
}

export interface DesignIndex {
  schemaVersion: 1;
  generatedFrom: { documentId: string; documentName: string; updatedAt: string };
  pages: IndexPageEntry[];
  frames: IndexFrameEntry[];
  components: IndexComponentEntry[];
  assets: IndexAssetEntry[];
  tokens: IndexTokenEntry[];
  interactions: IndexInteractionEntry[];
  edges: IndexEdge[];
  totals: DesignIndexTotals;
  /** 这份索引**没有**带什么。面板原样显示，读的人不必猜边界在哪。 */
  omissions: string[];
  /** 只在 fitIndexToBudget 压过预算后出现：省掉了哪些条目，数字与说明都在 */
  dropped?: IndexDropped;
  trimmed?: string[];
}

export const DESIGN_INDEX_OMISSIONS: string[] = [
  "节点的完整样式值（这里只给结构摘要，逐节点样式仍要从文档读）",
  "Code Index（§69 的 File/Symbol/Function/Dependency 还没落地）",
  "语义检索与相关性排序（要 embedding provider；§49 只落了全文 + 子串）",
  "资产的实际像素内容（只有名字、类型与被引用次数）",
];

function tokenValue(token: Token): IndexTokenEntry["value"] {
  const v = token.value;
  if (v === null || typeof v === "string" || typeof v === "number" || typeof v === "boolean") {
    return v;
  }
  return "<complex>";
}

function nodeText(node: DesignNode): string {
  return typeof node.text === "string" ? node.text : "";
}

/** 子树里第一段非空文字（广度优先，按文档顺序），取到就停 */
function firstTextIn(page: Page, node: DesignNode): string {
  const queue = [...node.children];
  for (let i = 0; i < queue.length; i += 1) {
    const current = page.nodes[queue[i]!];
    if (!current) continue;
    const text = nodeText(current).trim();
    if (text) return text.length > 60 ? `${text.slice(0, 60)}…` : text;
    queue.push(...current.children);
  }
  return "";
}

function nodeName(page: Page, id: string | null | undefined): string | null {
  if (!id) return null;
  return page.nodes[id]?.name ?? null;
}

/** 一个节点引用到的资产：assetId 字段，或 fills / strokes 里的 image paint */
function nodeAssetIds(node: DesignNode): string[] {
  const ids = new Set<string>();
  if (node.assetId) ids.add(node.assetId);
  const paints = [...node.style.fills, ...node.style.strokes.flatMap((s) => s.paints)];
  for (const paint of paints) {
    if (paint.kind === "image") ids.add(paint.assetId);
  }
  return [...ids];
}

interface UseRecord {
  nodes: Set<string>;
  pages: Set<string>;
  via: Set<TokenUsageVia>;
}

function recordUse(
  map: Map<string, UseRecord>,
  id: string,
  nodeId: string,
  pageId: string,
): UseRecord {
  let use = map.get(id);
  if (!use) {
    use = { nodes: new Set(), pages: new Set(), via: new Set() };
    map.set(id, use);
  }
  use.nodes.add(nodeId);
  use.pages.add(pageId);
  return use;
}

/** 由设计文档产出 §70 索引。纯函数：不改文档、不读库、不碰时钟。 */
export function buildDesignIndex(document: DesignDocument): DesignIndex {
  const pages: IndexPageEntry[] = [];
  const frames: IndexFrameEntry[] = [];
  const interactions: IndexInteractionEntry[] = [];
  const edges: IndexEdge[] = [];

  const assetUse = new Map<string, UseRecord>();
  const componentUse = new Map<string, UseRecord>();
  const tokenUse = new Map<string, UseRecord>();

  const declaredTokens = new Set(document.tokens.map((token) => token.key));
  const assetName = new Map(document.assets.map((a) => [a.id, a.name]));
  const componentName = new Map(document.components.map((c) => [c.id, c.name]));
  const pageName = new Map(document.pages.map((p) => [p.id, p.name]));

  let nodes = 0;
  let reachableNodes = 0;
  let instanceCount = 0;
  let frameCount = 0;
  let sectionCount = 0;
  let textChars = 0;

  for (const page of document.pages) {
    const pageTokens = new Set<string>();
    const pageComponents = new Set<string>();
    const pageAssets = new Set<string>();
    let reachable = 0;
    let maxDepth = 0;
    let pageFrames = 0;
    let pageSections = 0;
    let pageInteractions = 0;
    let pageTextChars = 0;

    walk(page, (node, depth) => {
      reachable += 1;
      reachableNodes += 1;
      if (depth > maxDepth) maxDepth = depth;
      pageTextChars += nodeText(node).length;

      if (node.type === "frame" || node.type === "section") {
        const kind: "frame" | "section" = node.type;
        if (kind === "frame") {
          frameCount += 1;
          pageFrames += 1;
        } else {
          sectionCount += 1;
          pageSections += 1;
        }
        frames.push({
          id: node.id,
          name: node.name,
          kind,
          pageId: page.id,
          pageName: page.name,
          parent: nodeName(page, node.parentId),
          depth,
          childCount: node.children.length,
          layoutMode: node.layout.mode,
          size: { width: node.size.width, height: node.size.height },
          textPreview: firstTextIn(page, node),
        });
      }

      // 字段里的 {token.ref}：与 lint/health 共用 collectTokenRefs（同一份文档只有一套口径）
      const boundKeys = new Set(
        Object.values(node.bindingsMap ?? {}).map((ref) => tokenRefKey(ref) ?? ref),
      );
      const valueKeys = new Set(collectTokenRefs(node));
      for (const key of new Set([...valueKeys, ...boundKeys])) {
        const use = recordUse(tokenUse, key, node.id, page.id);
        if (valueKeys.has(key)) use.via.add("value");
        if (boundKeys.has(key)) use.via.add("binding");
        pageTokens.add(key);
        edges.push({ from: node.id, to: key, kind: "token" });
      }

      if (node.componentId) {
        instanceCount += 1;
        recordUse(componentUse, node.componentId, node.id, page.id);
        pageComponents.add(componentName.get(node.componentId) ?? node.componentId);
        edges.push({ from: node.id, to: node.componentId, kind: "instance" });
      }

      for (const assetId of nodeAssetIds(node)) {
        recordUse(assetUse, assetId, node.id, page.id);
        pageAssets.add(assetName.get(assetId) ?? assetId);
        edges.push({ from: node.id, to: assetId, kind: "asset" });
      }

      for (const it of node.interactions ?? []) {
        pageInteractions += 1;
        const target = typeof it.target === "string" ? it.target : null;
        let targetName: string | null = null;
        if (target) {
          targetName = nodeName(page, target) ?? pageName.get(target) ?? null;
          edges.push({ from: node.id, to: target, kind: "interaction" });
        }
        interactions.push({
          id: it.id,
          pageId: page.id,
          pageName: page.name,
          nodeId: node.id,
          nodeName: node.name,
          trigger: it.trigger,
          action: it.action,
          target,
          targetName,
        });
      }
    });

    nodes += Object.keys(page.nodes).length;
    textChars += pageTextChars;
    pages.push({
      id: page.id,
      name: page.name,
      route: page.meta?.route ?? null,
      nodeCount: Object.keys(page.nodes).length,
      reachable,
      frames: pageFrames,
      sections: pageSections,
      textChars: pageTextChars,
      components: [...pageComponents].sort(),
      assets: [...pageAssets].sort(),
      tokens: pageTokens.size,
      interactions: pageInteractions,
      maxDepth,
      viewport: { width: page.width, height: page.height },
    });
  }

  const usedOnPages = (use: UseRecord | undefined) =>
    [...(use?.pages ?? [])].map((id) => pageName.get(id) ?? id).sort();

  const componentEntries: IndexComponentEntry[] = document.components
    .map((component: ComponentDefinition) => {
      const use = componentUse.get(component.id);
      return {
        id: component.id,
        name: component.name,
        definedOnPage: component.pageId ? pageName.get(component.pageId) ?? null : null,
        props: component.props.map((p) => p.name).sort(),
        variants: component.variants.length,
        slots: component.slots.map((s) => s.name).sort(),
        instances: use ? use.nodes.size : 0,
        usedOnPages: usedOnPages(use),
        unused: !use,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  const assetEntries: IndexAssetEntry[] = document.assets
    .map((asset) => {
      const use = assetUse.get(asset.id);
      return {
        id: asset.id,
        name: asset.name,
        kind: asset.kind,
        usedByNodes: use ? use.nodes.size : 0,
        usedOnPages: usedOnPages(use),
        orphaned: !use,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  const declared: IndexTokenEntry[] = document.tokens.map((token) => {
    const use = tokenUse.get(token.key);
    return {
      key: token.key,
      type: token.type,
      group: token.group ?? null,
      value: tokenValue(token),
      modes: Object.keys(token.modes ?? {}).length,
      usedByNodes: use ? use.nodes.size : 0,
      via: [...(use?.via ?? [])].sort() as TokenUsageVia[],
      used: Boolean(use && use.nodes.size > 0),
    };
  });
  const undeclared: IndexTokenEntry[] = [...tokenUse.keys()]
    .filter((key) => !declaredTokens.has(key))
    .map((key) => {
      const use = tokenUse.get(key)!;
      return {
        key,
        type: "undeclared",
        group: null,
        value: "<complex>" as const,
        modes: 0,
        usedByNodes: use.nodes.size,
        via: [...use.via].sort() as TokenUsageVia[],
        used: true,
      };
    });
  const tokenEntries = [...declared, ...undeclared].sort((a, b) =>
    a.key.localeCompare(b.key),
  );

  return {
    schemaVersion: 1,
    generatedFrom: {
      documentId: document.id,
      documentName: document.name,
      updatedAt: document.metadata.updatedAt,
    },
    pages,
    frames,
    components: componentEntries,
    assets: assetEntries,
    tokens: tokenEntries,
    interactions,
    edges,
    totals: {
      pages: document.pages.length,
      nodes,
      reachableNodes,
      unreachableNodes: nodes - reachableNodes,
      frames: frameCount,
      sections: sectionCount,
      components: document.components.length,
      unusedComponents: componentEntries.filter((c) => c.unused).length,
      instances: instanceCount,
      assets: document.assets.length,
      orphanAssets: assetEntries.filter((a) => a.orphaned).length,
      tokens: document.tokens.length,
      unusedTokens: declared.filter((t) => !t.used).length,
      undeclaredTokenRefs: undeclared.length,
      interactions: interactions.length,
      edges: edges.length,
      textChars,
    },
    omissions: DESIGN_INDEX_OMISSIONS,
  };
}

/** 索引序列化后的字符数——和整份文档对比，把 §68 那句"别整个塞进去"变成可测的数字。 */
export function designIndexChars(index: DesignIndex): number {
  return JSON.stringify(index).length;
}

export function designDocumentChars(document: DesignDocument): number {
  return JSON.stringify(document).length;
}

/**
 * 索引本身也会超预算。基准（docs/PERFORMANCE.md）实测：1 万节点的文档索引出 714K 字符
 * （已是文档的 9.1%），照单全发给 Agent 就等于把 §68 那句话反过来做。
 * 所以压缩按**固定优先级**削细节，并把削掉了什么如实记下来——
 * totals 永远来自未裁剪的那一份，宁可少列条目，不许少报数（§159）。
 */
export const DEFAULT_INDEX_CHAR_BUDGET = 20_000;

export interface IndexDropped {
  frames: number;
  edges: number;
  interactions: number;
  textPreviews: number;
}

export function fitIndexToBudget(
  index: DesignIndex,
  maxChars: number = DEFAULT_INDEX_CHAR_BUDGET,
): DesignIndex {
  if (maxChars <= 0 || designIndexChars(index) <= maxChars) return index;

  const next: DesignIndex = {
    ...index,
    pages: [...index.pages],
    frames: [...index.frames],
    components: [...index.components],
    assets: [...index.assets],
    tokens: [...index.tokens],
    interactions: [...index.interactions],
    edges: [...index.edges],
    omissions: [...index.omissions],
  };
  const dropped: IndexDropped = {
    frames: 0,
    edges: 0,
    interactions: 0,
    textPreviews: 0,
  };
  const trimmed: string[] = [];

  // 1) 文字预览最先牺牲：它帮人认结构，帮不了机器
  if (next.frames.some((f) => f.textPreview)) {
    dropped.textPreviews = next.frames.filter((f) => f.textPreview).length;
    next.frames = next.frames.map((f) => ({ ...f, textPreview: "" }));
    trimmed.push(`去掉了 ${dropped.textPreviews} 个结构节点的文字预览`);
  }
  // 2) 边是目录里最贵、又最可推导的一份：按 kind 从多到少逐级丢
  const EDGE_ORDER: IndexEdgeKind[] = ["token", "asset", "instance", "interaction"];
  for (const kind of EDGE_ORDER) {
    if (designIndexChars(next) <= maxChars) break;
    const before = next.edges.length;
    next.edges = next.edges.filter((e) => e.kind !== kind);
    dropped.edges += before - next.edges.length;
  }
  if (dropped.edges > 0) {
    trimmed.push(`去掉了 ${dropped.edges} 条交叉引用边（完整关系要从文档读）`);
  }
  // 3) 只留浅层结构：深层节点仍在 totals 里，只是不再逐个列名
  if (designIndexChars(next) > maxChars) {
    const keepDepth = next.frames.reduce((max, f) => Math.max(max, f.depth), 0);
    let depth = keepDepth;
    while (depth > 0 && designIndexChars({ ...next, frames: next.frames.filter((f) => f.depth <= depth) }) > maxChars) {
      depth -= 1;
    }
    const kept = next.frames.filter((f) => f.depth <= depth);
    dropped.frames = next.frames.length - kept.length;
    if (dropped.frames > 0) {
      next.frames = kept;
      trimmed.push(`结构目录只列到第 ${depth} 层，省掉 ${dropped.frames} 个更深的框`);
    }
  }
  // 4) 交互按页保留前若干条：交互少，通常走不到这一步
  if (designIndexChars(next) > maxChars) {
    const kept = next.interactions.slice(0, Math.max(0, next.interactions.length - 20));
    dropped.interactions = next.interactions.length - kept.length;
    if (dropped.interactions > 0) {
      next.interactions = kept;
      trimmed.push(`交互只列前 ${kept.length} 条，另有 ${dropped.interactions} 条未展开`);
    }
  }

  next.dropped = dropped;
  next.trimmed = trimmed;
  if (designIndexChars(next) > maxChars) {
    trimmed.push(`即便只剩骨架仍是 ${designIndexChars(next)} 字符：预算 ${maxChars} 比这份项目的最小目录还小`);
  }
  return next;
}
