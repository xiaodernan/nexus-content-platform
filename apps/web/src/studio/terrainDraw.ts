import {
  WORLD_PLATEAU_RADIUS_MAX,
  WORLD_PLATEAU_RADIUS_MIN,
  WORLD_TERRAIN_HEIGHT_MAX,
  type WorldPlateau,
  type WorldPlateauProfile,
} from '@nexus/world-model';

/**
 * §140 的图上画地形（WorldGraphView 的「画地形」模式）用的纯算术。
 * 「能被单测钉住的算术不埋进组件」——夹取、取整、id 生成都在这里，
 * 组件只负责指针事件与存盘；预览圆和落库的圆走同一个夹取，所见即所存。
 */

/** 圆台 id：wp_ + 时间戳 + 随机尾巴——同一毫秒连画两个也不会撞（面板那版没有尾巴，这里补上） */
export function newPlateauId(): string {
  return `wp_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

/** 半径按模型边界收（1–400 世界单位）：拖出画布的圆不该把不合法的数递给 setWorldTerrain */
export function clampRadius(raw: number): number {
  // NaN 当拖没了算（收下限），+∞ 当拖到天边算（收上限）——都走边界，不把垃圾递给模型
  if (!Number.isFinite(raw)) return raw > 0 ? WORLD_PLATEAU_RADIUS_MAX : WORLD_PLATEAU_RADIUS_MIN;
  return Math.round(Math.min(WORLD_PLATEAU_RADIUS_MAX, Math.max(WORLD_PLATEAU_RADIUS_MIN, raw)));
}

/** 台面高度按模型边界收（0–6，与 elevation 同上界）；数字框的值是 string，空、负、超界都在这里兜住 */
export function clampHeight(raw: number | string): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return 0;
  return Math.round(Math.min(WORLD_TERRAIN_HEIGHT_MAX, Math.max(0, n)));
}

/**
 * 图上按下那一点是圆心、松手那一点定半径。
 * 坐标取整：世界图的网格是整数（节点位置同此），小数坐标在 3D 里没有对应的一格。
 * `profile` 缺省 mesa：老调用点（与没有这一栏的存盘）行为不变；cone 是第五片的坡。
 */
export function plateauFromDrag(
  center: { x: number; y: number },
  edge: { x: number; y: number },
  height: number,
  profile: WorldPlateauProfile = 'mesa',
): WorldPlateau {
  return {
    id: newPlateauId(),
    x: Math.round(center.x),
    y: Math.round(center.y),
    radius: clampRadius(Math.hypot(edge.x - center.x, edge.y - center.y)),
    height: clampHeight(height),
    // 只写 cone：mesa 是缺省，写进文档等于让每个存盘都多一栏没人读的默认值
    ...(profile === 'cone' ? { profile: 'cone' as const } : {}),
  };
}
