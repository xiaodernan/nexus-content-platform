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
  "没有地形、碰撞与导航网格：能走过去看到，不等于走在实地上。",
  "3D 模型与贴图（§34 的 model 资产）还没接进来：现在每个条目是一个占位几何体。",
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
