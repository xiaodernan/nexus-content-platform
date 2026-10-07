/**
 * §44 World Builder 的文档模型。
 *
 * 和设计模型同一条纪律（§16）：世界文档是唯一真值，面板、图视图（§45）、
 * 角色对话（§47）、RAG 语料（§49）都是它的投影。这里不放 React、不读文件、不碰数据库，
 * 所以它能在 Node 与浏览器两端跑同一份校验。
 *
 * 刻意没有"生成"：§44 的示例是「Create a dark fantasy world」→ AI 填出九类内容，
 * 那要真 provider 才能做（§159 不许假生成）。这里给的 `createWorld` 是一份**模板骨架**——
 * 九类各一个空条目，标题写着类名，正文是空串。它是脚手架，不是内容。
 */

export const WORLD_KINDS = [
  "lore",
  "history",
  "geography",
  "factions",
  "characters",
  "creatures",
  "items",
  "quests",
  "story",
] as const;

export type WorldKind = (typeof WORLD_KINDS)[number];

/** 九类的中文名：面板分组标题与模板条目都用它，避免各处各写一套 */
export const WORLD_KIND_LABELS: Record<WorldKind, string> = {
  lore: "传说",
  history: "历史",
  geography: "地理",
  factions: "势力",
  characters: "角色",
  creatures: "生物",
  items: "物品",
  quests: "任务",
  story: "故事",
};

export interface WorldNode {
  id: string;
  kind: WorldKind;
  title: string;
  body: string;
  /** 条目级时间戳：世界文档没有画布那套 revision，先按条目记录最后改动 */
  updatedAt: string;
  /**
   * §34 的 model 类资产 ID：这个条目在 3D 场景里用哪个模型渲染。
   * 没有它时退回到类别几何体（球/方/锥等）——不是美术模型，只是标记。
   * 库里 assets.kind='model' 的那一行就是它的来源（storageKey 指向 .glb/.gltf 文件）。
   */
  modelAssetId?: string;
}

/**
 * §45 的一条关系。有向：`守夜人 → 效忠 → 苍雪盟约` 与反向不是同一件事。
 * label 可以留空（图上不写字），但端点必须是真的条目。
 */
export interface WorldLink {
  id: string;
  from: string;
  to: string;
  label: string;
}

export interface WorldPoint {
  x: number;
  y: number;
  /**
   * §140 的高程（世界单位，0–6）：这个条目在 3D 世界里"浮"多高。缺省 0 = 贴地。
   * 高程是**条目的视觉属性**，不是可走地形——脚下的地没有坡（scene.ts 的限度里照实说）。
   */
  elevation?: number;
}

/** 高程的上界：给一个能看见的范围，不给"随便多高" */
export const WORLD_ELEVATION_MAX = 6;

export interface WorldDocument {
  id: string;
  /** 世界属于哪个项目；独立世界（还没挂到项目上）时为 null */
  projectId: string | null;
  name: string;
  summary: string;
  nodes: WorldNode[];
  /** §45 的边 */
  links: WorldLink[];
  /**
   * §45 的拖拽位置。故意与条目内容分开：位置是视图事实，
   * 换一台设备或重排一次图不该把谁写过的正文改掉。
   */
  positions: Record<string, WorldPoint>;
  createdAt: string;
  updatedAt: string;
}

export interface WorldIssue {
  code:
    | "bad-kind"
    | "empty-title"
    | "duplicate-id"
    | "missing-name"
    | "bad-timestamp"
    | "self-link"
    | "missing-endpoint"
    | "duplicate-link";
  message: string;
  nodeId?: string;
}

let counter = 0;
function uid(prefix: string): string {
  counter += 1;
  const now = Date.now().toString(36);
  const rand = Math.floor(Math.random() * 1679616)
    .toString(36)
    .padStart(4, "0");
  return `${prefix}_${now}${counter.toString(36)}${rand}`;
}

const stamp = (): string => new Date().toISOString();

export function isWorldKind(value: unknown): value is WorldKind {
  return typeof value === "string" && (WORLD_KINDS as readonly string[]).includes(value);
}

/**
 * 模板骨架：九类各一条空条目。
 *
 * 为什么不是"空文档"：§44 要的是那棵树，先让九类可见、可填，
 * 用户与 AI 都才有落点；为什么不是"生成的内容"：正文一律留空，
 * 填了字就是替用户编世界观，那是假生成（§159）。
 */
export function createWorld(name: string, projectId: string | null = null): WorldDocument {
  const at = stamp();
  return {
    id: uid("world"),
    projectId,
    name: name.trim() || "未命名世界",
    summary: "",
    nodes: WORLD_KINDS.map((kind) => ({
      id: uid("wn"),
      kind,
      title: WORLD_KIND_LABELS[kind],
      body: "",
      updatedAt: at,
    })),
    links: [],
    positions: {},
    createdAt: at,
    updatedAt: at,
  };
}

export function findWorldNode(
  document: WorldDocument,
  nodeId: string,
): WorldNode | undefined {
  return document.nodes.find((node) => node.id === nodeId);
}

export function nodesOfKind(document: WorldDocument, kind: WorldKind): WorldNode[] {
  return document.nodes.filter((node) => node.kind === kind);
}

export function addWorldNode(
  document: WorldDocument,
  input: { kind: WorldKind; title: string; body?: string },
): WorldDocument {
  const at = stamp();
  const node: WorldNode = {
    id: uid("wn"),
    kind: input.kind,
    title: input.title.trim() || WORLD_KIND_LABELS[input.kind],
    body: input.body ?? "",
    updatedAt: at,
  };
  return { ...document, nodes: [...document.nodes, node], updatedAt: at };
}

export function updateWorldNode(
  document: WorldDocument,
  nodeId: string,
  patch: Partial<Pick<WorldNode, "title" | "body" | "kind">>,
): WorldDocument {
  const at = stamp();
  let touched = false;
  const nodes = document.nodes.map((node) => {
    if (node.id !== nodeId) return node;
    touched = true;
    return {
      ...node,
      ...(patch.kind !== undefined ? { kind: patch.kind } : {}),
      ...(patch.title !== undefined ? { title: patch.title } : {}),
      ...(patch.body !== undefined ? { body: patch.body } : {}),
      updatedAt: at,
    };
  });
  if (!touched) return document;
  return { ...document, nodes, updatedAt: at };
}

/**
 * 删掉一个条目。九类骨架允许被删空——用户不想要"生物"这一类是合法选择，
 * 面板上再靠 `createWorld` 之外的入口补回来（addWorldNode 什么类都能加）。
 *
 * 挂在它身上的边一起消失（留着就是指向不存在条目的箭头，图上画不出来、
 * 校验也过不去）；位置同理。删之前想知道会掉几条边，用 `countLinksFor`。
 */
export function removeWorldNode(document: WorldDocument, nodeId: string): WorldDocument {
  if (!findWorldNode(document, nodeId)) return document;
  const at = stamp();
  const { [nodeId]: _dropped, ...positions } = document.positions ?? {};
  return {
    ...document,
    nodes: document.nodes.filter((node) => node.id !== nodeId),
    links: (document.links ?? []).filter((link) => link.from !== nodeId && link.to !== nodeId),
    positions,
    updatedAt: at,
  };
}

/** 删条目前的提示用：会连带去掉几条关系 */
export function countLinksFor(document: WorldDocument, nodeId: string): number {
  return (document.links ?? []).filter((link) => link.from === nodeId || link.to === nodeId).length;
}

/**
 * 连一条有向边。端点不存在、自己连自己、同一对再来一条，都不写进去——
 * 但绝不静默：`reason` 带回那句原因，调用方（面板 / AI 补丁）负责把它显示出来。
 */
export function linkWorldNodes(
  document: WorldDocument,
  from: string,
  to: string,
  label = "",
): { document: WorldDocument; reason: string | null } {
  if (from === to) return { document, reason: "一条关系需要两个不同的条目：不能自己连自己。" };
  const source = findWorldNode(document, from);
  const target = findWorldNode(document, to);
  if (!source || !target) {
    return { document, reason: "关系的端点不在这个世界里，没有连。" };
  }
  const exists = (document.links ?? []).some(
    (link) => link.from === from && link.to === to && link.label === label.trim(),
  );
  if (exists) return { document, reason: `${source.title} 已经这样连着 ${target.title} 了。` };
  const link: WorldLink = {
    id: uid("wl"),
    from,
    to,
    label: label.trim(),
  };
  return {
    document: { ...document, links: [...(document.links ?? []), link], updatedAt: stamp() },
    reason: null,
  };
}

export function removeWorldLink(document: WorldDocument, linkId: string): WorldDocument {
  const links = document.links ?? [];
  if (!links.some((link) => link.id === linkId)) return document;
  return { ...document, links: links.filter((link) => link.id !== linkId), updatedAt: stamp() };
}

/**
 * 拖拽落点。只记位置，不碰条目内容、也不碰 updatedAt 之外的任何东西。
 * `point.elevation` 省略时**保留原值**——拖动平面坐标不该把作者写过的高度打回地面。
 * 高度 0 不落键：贴地就是缺省，库里不存"没写过的数"。
 */
export function setWorldNodePosition(
  document: WorldDocument,
  nodeId: string,
  point: WorldPoint,
): WorldDocument {
  if (!findWorldNode(document, nodeId)) return document;
  const existing = document.positions?.[nodeId];
  const elevation =
    point.elevation !== undefined && Number.isFinite(point.elevation)
      ? Math.min(WORLD_ELEVATION_MAX, Math.max(0, point.elevation))
      : (existing?.elevation ?? 0);
  return {
    ...document,
    positions: {
      ...(document.positions ?? {}),
      [nodeId]: elevation !== 0 ? { x: point.x, y: point.y, elevation } : { x: point.x, y: point.y },
    },
    updatedAt: stamp(),
  };
}

/**
 * 只写高程（§140 的高程输入走这里）。与位置写入同一个纪律的另一半：
 * **不合法就不写**，把原因交回调用方（面板负责显示）；
 * 没摆过位置的条目没有坐标，高程也不收——先在世界图上摆一次，再写高度。
 */
export function setWorldNodeElevation(
  document: WorldDocument,
  nodeId: string,
  elevation: number,
): { document: WorldDocument; reason: string | null } {
  if (!findWorldNode(document, nodeId)) {
    return { document, reason: "这个条目不在世界文档里，没有写入。" };
  }
  const existing = document.positions?.[nodeId];
  if (!existing) {
    return { document, reason: "这条还没有摆过的位置——先在世界图上拖一下，再写高度。" };
  }
  if (typeof elevation !== "number" || !Number.isFinite(elevation)) {
    return { document, reason: `高度需要是一个数（收到 ${String(elevation)}）。` };
  }
  if (elevation < 0 || elevation > WORLD_ELEVATION_MAX) {
    return { document, reason: `高度要在 0 到 ${WORLD_ELEVATION_MAX} 之间（收到 ${elevation}）。` };
  }
  // 高度 0 = 贴地 = 没写过：把键拿掉，库里不留"显式的缺省值"
  const { elevation: _dropped, ...rest } = existing;
  return {
    document: {
      ...document,
      positions: {
        ...(document.positions ?? {}),
        [nodeId]: elevation !== 0 ? { x: existing.x, y: existing.y, elevation } : rest,
      },
      updatedAt: stamp(),
    },
    reason: null,
  };
}

/** 图上排布的间距：一列一类，同类里往下堆 */
export const GRAPH_COLUMN_GAP = 220;
export const GRAPH_ROW_GAP = 96;
export const GRAPH_ORIGIN = { x: 90, y: 72 };

/**
 * 给没有位置的条目一个确定性的排布（按类分列、列内按加入顺序堆叠）。
 * 确定性很重要：同一份文档每次都排成同一个样子，"拖完刷新又乱跑"会被当成 bug。
 */
export function autoLayout(document: WorldDocument): Record<string, WorldPoint> {
  const out: Record<string, WorldPoint> = {};
  const columns = new Map<WorldKind, number>();
  for (const node of document.nodes) {
    const kindIndex = WORLD_KINDS.indexOf(node.kind);
    if (kindIndex < 0) continue;
    const row = columns.get(node.kind) ?? 0;
    columns.set(node.kind, row + 1);
    out[node.id] = {
      x: GRAPH_ORIGIN.x + kindIndex * GRAPH_COLUMN_GAP,
      y: GRAPH_ORIGIN.y + row * GRAPH_ROW_GAP,
    };
  }
  return out;
}

/** 落库位置优先，缺的按 autoLayout 补：图视图与测试都读这份投影 */
export function worldPositions(document: WorldDocument): Record<string, WorldPoint> {
  return { ...autoLayout(document), ...(document.positions ?? {}) };
}

export interface WorldGraphNode {
  id: string;
  title: string;
  kind: WorldKind;
  x: number;
  y: number;
}

export interface WorldGraphEdge {
  id: string;
  label: string;
  from: WorldGraphNode;
  to: WorldGraphNode;
}

/**
 * §45 的图投影：节点 + 边 + 坐标。
 * 指向已删条目的边在这里被自然丢掉（渲染层不该看到画不出来的东西），
 * 而 validateWorld 会同时把它作为 `missing-endpoint` 报出来——两件事都要有。
 */
export function worldGraph(document: WorldDocument): {
  nodes: WorldGraphNode[];
  edges: WorldGraphEdge[];
} {
  const positions = worldPositions(document);
  const byId = new Map<string, WorldGraphNode>();
  const nodes = document.nodes.map((node) => {
    const at = positions[node.id] ?? GRAPH_ORIGIN;
    const view: WorldGraphNode = {
      id: node.id,
      title: node.title,
      kind: node.kind,
      x: Math.round(at.x),
      y: Math.round(at.y),
    };
    byId.set(node.id, view);
    return view;
  });
  const edges: WorldGraphEdge[] = [];
  for (const link of document.links ?? []) {
    const from = byId.get(link.from);
    const to = byId.get(link.to);
    if (!from || !to) continue;
    edges.push({ id: link.id, label: link.label, from, to });
  }
  return { nodes, edges };
}

/** 结构校验：不合法的内容不该进库，也不该在面板上假装存在 */
export function validateWorld(document: WorldDocument): WorldIssue[] {
  const issues: WorldIssue[] = [];
  if (!document || typeof document !== "object") {
    return [{ code: "missing-name", message: "世界文档不是一个对象" }];
  }
  if (!document.name?.trim()) {
    issues.push({ code: "missing-name", message: "世界没有名字" });
  }
  const seen = new Set<string>();
  for (const node of document.nodes ?? []) {
    if (!isWorldKind(node.kind)) {
      issues.push({
        code: "bad-kind",
        message: `条目「${node.title || node.id}」的类型不在九类之内：${String(node.kind)}`,
        nodeId: node.id,
      });
    }
    if (!node.title?.trim()) {
      issues.push({
        code: "empty-title",
        message: "有条目没有标题（写进世界里的东西总得有个名字）",
        nodeId: node.id,
      });
    }
    if (seen.has(node.id)) {
      issues.push({
        code: "duplicate-id",
        message: `条目 id 重复：${node.id}`,
        nodeId: node.id,
      });
    }
    seen.add(node.id);
    if (typeof node.updatedAt !== "string" || Number.isNaN(Date.parse(node.updatedAt))) {
      issues.push({
        code: "bad-timestamp",
        message: `条目「${node.title || node.id}」的 updatedAt 不是合法时间`,
        nodeId: node.id,
      });
    }
  }
  const seenPair = new Set<string>();
  for (const link of document.links ?? []) {
    if (link.from === link.to) {
      issues.push({
        code: "self-link",
        message: `有条关系把自己连到了自己身上（${link.from}）`,
        nodeId: link.from,
      });
    }
    if (!seen.has(link.from) || !seen.has(link.to)) {
      issues.push({
        code: "missing-endpoint",
        message: `有条关系连到了不存在的世界条目（${link.from} → ${link.to}）`,
        nodeId: link.from,
      });
    }
    const pair = `${link.from}→${link.to}#${link.label}`;
    if (seenPair.has(pair)) {
      issues.push({
        code: "duplicate-link",
        message: `同一对条目之间重复写了同样的关系（${link.from} → ${link.to}）`,
        nodeId: link.from,
      });
    }
    seenPair.add(pair);
  }
  return issues;
}

/** 每个类各有多少条：面板与后续 RAG 摄取都用它做粗算 */
export function worldCounts(document: WorldDocument): Record<WorldKind, number> {
  const counts = Object.fromEntries(WORLD_KINDS.map((k) => [k, 0])) as Record<WorldKind, number>;
  for (const node of document.nodes) {
    if (isWorldKind(node.kind)) counts[node.kind] += 1;
  }
  return counts;
}

export * from "./character";

export * from "./scene";
