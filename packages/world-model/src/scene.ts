import { WORLD_KINDS, WORLD_KIND_LABELS, type WorldDocument, type WorldKind } from "./index";

/**
 * §140 的 3D 世界：把世界文档投影成一份"可以走进去"的场景计划。
 *
 * 和渲染层分开是有原因的（§16）：这份投影是纯函数、无 React、无 WebGL，
 * 所以"位置从哪来、没摆过位置的条目怎么放"这类会说谎的地方能被单测钉住，
 * 而不是埋在三维组件里靠肉眼看。
 *
 * 三条刻意的克制：
 * - **位置只认 §45 那张图上摆过的坐标**（`positions`）。没摆过的按文档顺序排在同心环上，
 *   并如实标成 `fallback`——那是为了让世界「可走」而用的规则，不是作者设计过的地形。
 * - **大小一律相同**。世界文档里没有「重要性」字段，按正文长度或类别给大小就是编出来的等级。
 * - **颜色按九类固定分配**，图例里写清楚"颜色=类别"，别让人读成「红色=危险」。
 */

/** 九类的固定配色：与 §45 图视图同一套语义（类别，不是等级） */
export const WORLD_KIND_COLORS: Record<WorldKind, string> = {
  lore: "#8f7bff",
  history: "#c9a227",
  geography: "#2fb47c",
  factions: "#e2574c",
  characters: "#3aa0ff",
  creatures: "#b56cff",
  items: "#ff9f43",
  quests: "#20c6b7",
  story: "#e8eaed",
};

export interface SceneEntity {
  id: string;
  title: string;
  kind: WorldKind;
  kindLabel: string;
  color: string;
  /** 世界平面上的坐标：x 向东、z 向南（屏幕里就是"往画面里"） */
  x: number;
  z: number;
  /** authored = 来自 §45 图上摆过的位置；fallback = 没摆过，按文档顺序排在环上 */
  placed: "authored" | "fallback";
  /** 条目正文，走近了给 HUD 显示。3D 里没有"看不见就不必读"这回事，所以整段带上 */
  body: string;
  /** 图上写过的高程（0–6）：条目浮在写的高度上。没写就是 0（贴地） */
  elevation: number;
  /** §34 的 model 类资产 ID：这个条目用哪个 .glb/.gltf 渲染。没有时用占位几何体 */
  modelAssetId?: string;
}

export interface SceneLink {
  id: string;
  from: string;
  to: string;
  label: string;
  /** 两端的世界坐标；只有一端有位置时这条线不画（不猜另一端在哪） */
  points: { from: [number, number]; to: [number, number] } | null;
}

export interface WorldScene {
  worldName: string;
  summary: string;
  entities: SceneEntity[];
  links: SceneLink[];
  /** 场景外接框，给相机与地面网格用 */
  bounds: { radius: number };
  stats: { entities: number; authored: number; fallback: number; links: number; linksDrawn: number };
  /** 这份投影的限度，随结果一起给 UI 显示：走了半天别以为看到的是作者设计过的地形 */
  limits: string[];
}

/** 没摆过位置的条目：按文档顺序排在同心环上。半径与角度都是算出来的常量，没有任何随机 */
const RING_BASE_RADIUS = 14;
const RING_GAP = 9;

function fallbackRing(index: number): { x: number; z: number } {
  const ring = Math.floor(index / 8);
  const around = index % 8;
  const radius = RING_BASE_RADIUS + ring * RING_GAP;
  const angle = (around / 8) * Math.PI * 2;
  return { x: Math.round(Math.sin(angle) * radius * 100) / 100, z: Math.round(Math.cos(angle) * radius * 100) / 100 };
}

export const SCENE_LIMITS: string[] = [
  "位置来自 §45 那张世界图上摆过的坐标；没摆过的按文档顺序排在同心环上——那不是作者设计过的地形。",
  "所有条目大小一样：世界文档里没有「重要性」也没有「体积」字段，给不同大小就是编出来的等级。",
  "颜色只表示九类内容中的哪一类，不表示危险、阵营或温度。",
  "高程是图上写的条目属性（0–6）：条目浮在写的高度上，柱子是它的标架；脚下的地没有坡——走近高处的条目是它浮着，不是你在爬山。",
  "条目占位会挡路（圆碰撞），点击行走是直线加碰撞滑动，不是导航网格。",
  "条目可以挂 §34 的 model 资产（.glb/.gltf）：有模型时显示模型，没有时用占位几何体。",
];

export function buildWorldScene(document: WorldDocument): WorldScene {
  const entities: SceneEntity[] = [];
  let fallbackIndex = 0;

  for (const node of document.nodes) {
    const point = document.positions[node.id];
    const placed: SceneEntity["placed"] = point ? "authored" : "fallback";
    const at = point ? { x: point.x, z: point.y } : fallbackRing(fallbackIndex++);
    entities.push({
      id: node.id,
      title: node.title,
      kind: node.kind,
      kindLabel: WORLD_KIND_LABELS[node.kind] ?? node.kind,
      color: WORLD_KIND_COLORS[node.kind] ?? "#8f7bff",
      x: at.x,
      z: at.z,
      placed,
      body: node.body,
      elevation: point?.elevation ?? 0,
      modelAssetId: node.modelAssetId,
    });
  }

  const byId = new Map(entities.map((e) => [e.id, e]));
  const links: SceneLink[] = document.links.map((link) => {
    const from = byId.get(link.from);
    const to = byId.get(link.to);
    return {
      id: link.id,
      from: link.from,
      to: link.to,
      label: link.label,
      points: from && to ? { from: [from.x, from.z], to: [to.x, to.z] } : null,
    };
  });

  const radius = entities.reduce((max, e) => Math.max(max, Math.abs(e.x), Math.abs(e.z)), RING_BASE_RADIUS);

  return {
    worldName: document.name,
    summary: document.summary,
    entities,
    links,
    bounds: { radius: Math.ceil((radius + 8) / 5) * 5 },
    stats: {
      entities: entities.length,
      authored: entities.filter((e) => e.placed === "authored").length,
      fallback: entities.filter((e) => e.placed === "fallback").length,
      links: links.length,
      linksDrawn: links.filter((l) => l.points).length,
    },
    limits: [...SCENE_LIMITS],
  };
}

/** 走近了才展开条目：距离阈值给 HUD 与相机共用一个数，别两处各写一个 */
export const NEARBY_RADIUS = 9;

export function nearestEntities(scene: WorldScene, at: { x: number; z: number }, radius = NEARBY_RADIUS): SceneEntity[] {
  return scene.entities
    .map((e) => ({ e, d: Math.hypot(e.x - at.x, e.z - at.z) }))
    .filter((hit) => hit.d <= radius)
    .sort((a, b) => a.d - b.d || (a.e.id < b.e.id ? -1 : 1))
    .map((hit) => hit.e);
}

/** 图例：类别 → 颜色。顺序固定按 WORLD_KINDS，不随场景内容变 */
export function sceneLegend(scene: WorldScene): { kind: WorldKind; label: string; color: string; count: number }[] {
  return WORLD_KINDS.map((kind) => ({
    kind,
    label: WORLD_KIND_LABELS[kind],
    color: WORLD_KIND_COLORS[kind],
    count: scene.entities.filter((e) => e.kind === kind).length,
  })).filter((entry) => entry.count > 0);
}

/** 标签上限：一个世界最多 5000 个条目，全画标签等于没画（也拖死主线程） */
export const LABEL_LIMIT = 60;

export interface LabelTarget extends SceneEntity {
  /** 到观察者水平距离；标签按它排序，也显示在 tooltip 里 */
  distance: number;
}

/**
 * 离观察者最近的若干个条目——只给这些画名字标签。
 * 排序键是 (距离, id)：距离相等时按 id，这样同一位置反复调用不会来回换顺序。
 */
export function pickLabelTargets(
  scene: WorldScene,
  at: { x: number; z: number },
  limit = LABEL_LIMIT,
): LabelTarget[] {
  return scene.entities
    .map((entity) => ({ entity, distance: Math.hypot(entity.x - at.x, entity.z - at.z) }))
    .sort((a, b) => a.distance - b.distance || (a.entity.id < b.entity.id ? -1 : 1))
    .slice(0, Math.max(0, limit))
    .map(({ entity, distance }) => ({ ...entity, distance: Math.round(distance * 100) / 100 }));
}

/**
 * 走动与碰撞（§140 的 walk 第一片）。这两条**不是模型字段**：世界文档里没有体积、
 * 没有高程，占位与行走者是这份场景投影自己定义的几何（所以进 `limits` 披露）。
 * 放在模型包而不是三维组件里，与 isoProject 同一条理由：能被单测钉住的算术
 * 不该埋在组件里靠肉眼看（§16）。
 */

/** 行走者的脚印半径（世界单位） */
export const WALKER_RADIUS = 0.8;
/** 每个条目的占位半径：与渲染的 1.6 盒子同级，略大于半宽，给路标柱留一点余量 */
export const ENTITY_FOOTPRINT_RADIUS = 1.2;

export interface WalkPosition {
  x: number;
  z: number;
  /** 这一帧把行走者推出过脚印的条目（多个重叠时是第一个挡路的）；没被挡就是 null */
  blockedBy: string | null;
}

/**
 * 把行走者从所有条目占位里推出来（圆-圆，逐条目按场景顺序解，确定性）。
 * 站在条目正中心这种退化情况沿 +x 推出——不抛异常、不 NaN。
 */
export function resolveWalkCollision(scene: WorldScene, x: number, z: number): WalkPosition {
  let cx = x;
  let cz = z;
  let blockedBy: string | null = null;
  const min = ENTITY_FOOTPRINT_RADIUS + WALKER_RADIUS;
  for (const entity of scene.entities) {
    const dx = cx - entity.x;
    const dz = cz - entity.z;
    const d = Math.hypot(dx, dz);
    if (d >= min) continue;
    if (d > 1e-6) {
      cx = entity.x + (dx / d) * min;
      cz = entity.z + (dz / d) * min;
    } else {
      cx = entity.x + min;
    }
    blockedBy = blockedBy ?? entity.id;
  }
  return { x: cx, z: cz, blockedBy };
}

/**
 * 点击行走的一步：朝 target 最多走 step 个单位，然后解碰撞。
 * step 内就到（或已经站在 target 上）算 arrived——target 在占位里时（比如点了条目身上）
 * 停在占位表面并仍报 arrived，调用方不需要再处理"到不了"。
 * 被占位挡住时滑动到表面为止：这不是寻路网格，绕不过大障碍——调用方（HUD）照实说。
 */
export function walkToward(
  scene: WorldScene,
  from: { x: number; z: number },
  target: { x: number; z: number },
  step: number,
): WalkPosition & { arrived: boolean } {
  const dx = target.x - from.x;
  const dz = target.z - from.z;
  const dist = Math.hypot(dx, dz);
  if (dist <= Math.max(0, step)) {
    return { ...resolveWalkCollision(scene, target.x, target.z), arrived: true };
  }
  const nx = from.x + (dx / dist) * step;
  const nz = from.z + (dz / dist) * step;
  return { ...resolveWalkCollision(scene, nx, nz), arrived: false };
}
