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

/**
 * §140 的地形（2026-10-10 第四片）：作者画的**可走**高度场。
 *
 * 与 `WorldPoint.elevation` 的分工：elevation 是**条目的视觉属性**（条目浮多高、柱子是标架），
 * 脚下的地没有坡；terrain 则是地本身的高度——走近圆台是"站在台子上"，
 * 行走者的相机高度、点击地面的射线都读它（`scene.ts` 的 `terrainHeightAt`）。
 * 刻意用一组**圆台**而不是网格高度场：序列化简单、`validateWorld` 能校验、
 * 纯函数可单测（"能被单测钉住的算术不埋进组件"，与 elevation 同一条理由）。
 * 世界文档没有 terrain = 没有地形 = 平地（老世界照常读得出）。
 */
export interface WorldPlateau {
  id: string;
  /** 世界平面坐标：x 向东、z 向南（与 §45 的 x/y 同一套，z 就是图的 y） */
  x: number;
  y: number;
  /** 圆台半径（世界单位）。要 > 0：半径为 0 的台子站不上去 */
  radius: number;
  /** 台面高度（0–6，与 elevation 同一上界：站在台子上的"海拔"） */
  height: number;
  /**
   * 剖面（§140 第五片，2026-10-15）：这个圆台是硬边台面还是圆锥坡。
   * - 缺省（undefined / 'mesa'）：半径内恒为 height，半径外 0——第四片的行为，一个字节不变。
   * - 'cone'：台心 height、边缘 0，中间线性（`height * (1 - d/radius)`）——可走的坡。
   * 老文档没有这一栏 = mesa：可选字段 + 缺省即旧语义，与"没有 terrain = 平地"同一条纪律。
   */
  profile?: 'mesa' | 'cone';
}

export interface WorldTerrain {
  kind: 'plateaus';
  plateaus: WorldPlateau[];
}

/** 地形高度的上界：与 WORLD_ELEVATION_MAX 同一边界——台子再高就出了这个世界能看见的范围 */
export const WORLD_TERRAIN_HEIGHT_MAX = WORLD_ELEVATION_MAX;
/** 一个世界最多多少个圆台：够用且不失控（再多就该在面板上分批画，而不是一次铺满） */
export const WORLD_PLATEAU_LIMIT = 64;
/** 圆台半径的边界：太小的台子（走一步就掉下去）与太大的圆（覆盖整个世界）都不是地形 */
export const WORLD_PLATEAU_RADIUS_MIN = 1;
export const WORLD_PLATEAU_RADIUS_MAX = 400;
/** 圆台的两种剖面。名字进契约（`WorldPlateauSchema.profile`），这里是模型侧读得懂的那一份 */
export const WORLD_PLATEAU_PROFILES = ['mesa', 'cone'] as const;
export type WorldPlateauProfile = (typeof WORLD_PLATEAU_PROFILES)[number];

/** 收到的剖面是不是这两种之一。缺省算 mesa——写成函数是为了让两处校验和投影共用同一句话 */
export function isWorldPlateauProfile(value: unknown): value is WorldPlateauProfile {
  return value === undefined || (WORLD_PLATEAU_PROFILES as readonly unknown[]).includes(value);
}

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
  /**
   * §140 的可走地形（2026-10-10）。缺省 = 没有 = 平地。
   * 位置与高程分开存，地形也分开：它是世界的地，不是哪个条目的属性。
   */
  terrain?: WorldTerrain;
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
    | "duplicate-link"
    | "bad-terrain";
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
 * 给条目挂（或摘掉）§34 的 model 类资产：3D 世界里这个条目用哪个 .glb/.gltf 渲染。
 *
 * 写入纪律与 `setWorldNodeElevation` 同一边：**不合法就不写，原因交回调用方**（面板显示）。
 * 这一格刻意不做归属校验——世界文档是模型，不认识资产表；"这个 id 是不是本项目的
 * model 资产"由面板那一端保证（选择器只列本项目 kind='model' 的资产，见 WorldPanel）。
 * 模型侧只保证形状：非空字符串，或 `null`（摘掉）。
 *
 * `null` 是**删键**而不是写空串：`{}` 表示"没挂模型、用类别几何体占位"，
 * 与 `{ modelAssetId: '' }`（挂了一个空 id，加载必然失败）是两件事，后者会在 3D 世界里
 * 留下一个"永远转圈然后没东西"的条目——那比不挂更难查。
 */
export function setWorldNodeModelAsset(
  document: WorldDocument,
  nodeId: string,
  assetId: string | null,
): { document: WorldDocument; reason: string | null } {
  if (!findWorldNode(document, nodeId)) {
    return { document, reason: "这个条目不在世界文档里，没有写入。" };
  }
  if (assetId !== null && (typeof assetId !== "string" || assetId.trim().length === 0)) {
    return { document, reason: "资产 id 不能是空的：不挂模型就传 null（用类别几何体占位）。" };
  }
  const at = stamp();
  const nodes = document.nodes.map((node) => {
    if (node.id !== nodeId) return node;
    if (assetId === null) {
      const { modelAssetId: _dropped, ...rest } = node;
      return rest;
    }
    return { ...node, modelAssetId: assetId.trim() };
  });
  return {
    document: { ...document, nodes, updatedAt: at },
    reason: null,
  };
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

/**
 * §140 地形（第四片）的写入端。三条纪律，与 `setWorldNodeElevation` 同一边：
 * - **不合法就不写**，原因交回调用方（面板显示），不悄悄归零也不抛异常；
 * - **整份换掉**而不是逐台增删：地形是一次性设计，补丁式增删迟早出现"两处编辑器
 *   同时改地形"的问题，而这个世界还没有并发地形编辑器（有的话再拆成 command）；
 * - `null` = 把地形收掉（回到平地），不是"加一个空地形"。
 * 归属校验不做：模型不认识任何 UI，id 对不上由调用方显示 `reason`。
 */
export function setWorldTerrain(
  document: WorldDocument,
  terrain: WorldTerrain | null,
): { document: WorldDocument; reason: string | null } {
  if (terrain === null) {
    if (!document.terrain) return { document, reason: null };
    const { terrain: _dropped, ...rest } = document;
    return { document: { ...rest, updatedAt: stamp() }, reason: null };
  }
  if (!terrain || typeof terrain !== 'object') {
    return { document, reason: '地形需要是一个地形对象（kind 与圆台清单）。' };
  }
  if (terrain.kind !== 'plateaus') {
    return { document, reason: `地形类型还不认识：${String(terrain.kind)}（今天只有圆台 plateaus）。` };
  }
  if (!Array.isArray(terrain.plateaus)) {
    return { document, reason: '地形的圆台清单不对。' };
  }
  if (terrain.plateaus.length > WORLD_PLATEAU_LIMIT) {
    return {
      document,
      reason: `一个世界的圆台最多 ${WORLD_PLATEAU_LIMIT} 个（收到 ${terrain.plateaus.length} 个）。`,
    };
  }
  const seen = new Set<string>();
  for (const plateau of terrain.plateaus) {
    if (!plateau || typeof plateau !== 'object') {
      return { document, reason: '有一个圆台不是对象。' };
    }
    if (!plateau.id?.trim() || plateau.id.length > 128) {
      return { document, reason: '圆台需要一个 id（1–128 字符）。' };
    }
    if (seen.has(plateau.id)) {
      return { document, reason: `圆台 id 重复：${plateau.id}` };
    }
    seen.add(plateau.id);
    for (const axis of [plateau.x, plateau.y] as const) {
      if (typeof axis !== 'number' || !Number.isFinite(axis)) {
        return { document, reason: `圆台的坐标要能是有限数（收到 ${String(axis)}）。` };
      }
      if (Math.abs(axis) > 100_000) {
        return { document, reason: `圆台跑出了世界范围（收到 ${axis}）。` };
      }
    }
    if (typeof plateau.radius !== 'number' || !Number.isFinite(plateau.radius)) {
      return { document, reason: `圆台的半径要是一个数（收到 ${String(plateau.radius)}）。` };
    }
    if (plateau.radius < WORLD_PLATEAU_RADIUS_MIN || plateau.radius > WORLD_PLATEAU_RADIUS_MAX) {
      return {
        document,
        reason: `圆台的半径要在 ${WORLD_PLATEAU_RADIUS_MIN} 到 ${WORLD_PLATEAU_RADIUS_MAX} 之间（收到 ${plateau.radius}）——太小的台子走一步就掉下去，太大的圆覆盖整个世界。`,
      };
    }
    if (typeof plateau.height !== 'number' || !Number.isFinite(plateau.height)) {
      return { document, reason: `圆台的高度要是一个数（收到 ${String(plateau.height)}）。` };
    }
    if (plateau.height < 0 || plateau.height > WORLD_TERRAIN_HEIGHT_MAX) {
      return {
        document,
        reason: `圆台的高度要在 0 到 ${WORLD_TERRAIN_HEIGHT_MAX} 之间（收到 ${plateau.height}）。`,
      };
    }
    if (!isWorldPlateauProfile(plateau.profile)) {
      return {
        document,
        reason: `圆台的剖面只有 mesa（硬边台面）和 cone（圆锥坡）两种（收到 ${String(plateau.profile)}）。`,
      };
    }
  }
  return {
    document: {
      ...document,
      terrain: {
        kind: 'plateaus',
        plateaus: terrain.plateaus.map((plateau) => ({
          id: plateau.id,
          x: plateau.x,
          y: plateau.y,
          radius: plateau.radius,
          height: plateau.height,
          // 只写 cone：mesa 是缺省，写进 JSON 等于让每个老世界的存盘都多一栏没人读的默认值
          ...(plateau.profile === 'cone' ? { profile: 'cone' as const } : {}),
        })),
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
  const terrain = document.terrain;
  if (terrain !== undefined) {
    if (!terrain || typeof terrain !== 'object' || terrain.kind !== 'plateaus') {
      issues.push({ code: "bad-terrain", message: "地形要么是圆台地形（kind: plateaus），要么没有地形。" });
    } else if (!Array.isArray(terrain.plateaus)) {
      issues.push({ code: "bad-terrain", message: "地形的圆台清单不对。" });
    } else {
      if (terrain.plateaus.length > WORLD_PLATEAU_LIMIT) {
        issues.push({
          code: "bad-terrain",
          message: `一个世界的圆台最多 ${WORLD_PLATEAU_LIMIT} 个（收到 ${terrain.plateaus.length} 个）。`,
        });
      }
      const seenPlateau = new Set<string>();
      for (const plateau of terrain.plateaus) {
        if (!plateau?.id?.trim()) {
          issues.push({ code: "bad-terrain", message: "有个圆台没有 id。" });
          continue;
        }
        if (seenPlateau.has(plateau.id)) {
          issues.push({ code: "bad-terrain", message: `圆台 id 重复：${plateau.id}` });
        }
        seenPlateau.add(plateau.id);
        for (const axis of [plateau.x, plateau.y] as const) {
          if (typeof axis !== "number" || !Number.isFinite(axis) || Math.abs(axis) > 100_000) {
            issues.push({ code: "bad-terrain", message: `圆台「${plateau.id}」的坐标不在世界范围内。` });
          }
        }
        if (
          typeof plateau.radius !== "number" ||
          !Number.isFinite(plateau.radius) ||
          plateau.radius < WORLD_PLATEAU_RADIUS_MIN ||
          plateau.radius > WORLD_PLATEAU_RADIUS_MAX
        ) {
          issues.push({
            code: "bad-terrain",
            message: `圆台「${plateau.id}」的半径要在 ${WORLD_PLATEAU_RADIUS_MIN} 到 ${WORLD_PLATEAU_RADIUS_MAX} 之间。`,
          });
        }
        if (
          typeof plateau.height !== "number" ||
          !Number.isFinite(plateau.height) ||
          plateau.height < 0 ||
          plateau.height > WORLD_TERRAIN_HEIGHT_MAX
        ) {
          issues.push({
            code: "bad-terrain",
            message: `圆台「${plateau.id}」的高度要在 0 到 ${WORLD_TERRAIN_HEIGHT_MAX} 之间。`,
          });
        }
        if (!isWorldPlateauProfile(plateau.profile)) {
          issues.push({
            code: "bad-terrain",
            message: `圆台「${plateau.id}」的剖面只有 mesa 和 cone 两种（收到 ${String(plateau.profile)}）。`,
          });
        }
      }
    }
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
