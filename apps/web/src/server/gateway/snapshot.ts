/**
 * 把网关三份读数按 service id 拼成一张运维能读的态势图（SC-40 的语义核心）。
 *
 * 三份读数**各说各的**：routes 说门会转发到哪、services 说注册中心记着谁、health 说实测谁还活着。
 * 单看任何一份都回答不了"这条路由现在通向一个活着的实例吗"。join 的全部价值就在对错处：
 *   - 注册中心有、路由表没有 → 一个未纳管服务（SC-39 坐实的 rogue 边界：门不给它路由）；
 *   - 路由表指向、注册中心没有 → 一条悬空路由（配置漂移，转发必失败）；
 *   - 健康探测 DOWN / UNKNOWN → 实例级故障，且 UNKNOWN 不许说成 DOWN（没答不等于死了）。
 *
 * **这一片最要钉死的纪律：没测到的列画 `null`，不画 0。**
 * 注册列 unavailable 时 `registeredInstances = null`（"不知道有几个"），不是 0（"一个都没有"）——
 * 后者是一句具体的谎，会让运维去查一个根本不存在的下线事故。每一格 `null` 的含义都写进 gaps，
 * 上屏时由 UI 渲染成"—（未测）"。三份读数的 measuredAt 各不相同，`gaps` 里也如实说明
 * 这不是同一瞬间的原子快照，而是三张带各自日期的事实拼起来的一张图。
 */

import {
  serviceIdFromUri,
  type HealthReadout,
  type HealthStatus,
  type Readout,
  type RoutesReadout,
  type ServicesReadout,
} from './types';

export type ServiceHealthView = HealthStatus | 'NOT_PROBED' | 'NOT_MEASURED';

export interface JoinedService {
  readonly id: string;
  /** 路由表里指向这个 service 的路由 id（一个 service 可被多条路由指向） */
  readonly routeIds: readonly string[];
  /** 注册中心记着的实例数；注册列没测到时是 null（不是 0） */
  readonly registeredInstances: number | null;
  readonly addresses: readonly string[];
  /** 该 service 下实例的最差健康态（保守聚合）；健康列没测到时 NOT_MEASURED */
  readonly health: ServiceHealthView;
  readonly downInstances: number;
  readonly unknownInstances: number;
  readonly classification: 'routed-healthy' | 'routed-degraded' | 'routed-down' | 'unrouted' | 'dangling';
}

export type GapKind =
  | 'column-unavailable'
  | 'stale-column'
  | 'unrouted-service'
  | 'dangling-route'
  | 'instance-down'
  | 'instance-unknown'
  | 'non-atomic';

export interface Gap {
  readonly kind: GapKind;
  readonly column?: 'routes' | 'services' | 'health';
  readonly ids?: readonly string[];
  readonly note: string;
}

/** 一列有值可用（哪怕陈旧）才算"测到了"；unavailable 才是"不知道"。 */
function columnHasValue<T>(readout: Readout<T>): boolean {
  return readout.state !== 'unavailable' && readout.value !== null;
}

const HEALTH_WEIGHT: Record<HealthStatus, number> = { UP: 0, UNKNOWN: 1, DOWN: 2 };

/** 保守聚合：任一 DOWN 即 DOWN，否则任一 UNKNOWN 即 UNKNOWN，全 UP 才 UP，没有实例是 NOT_PROBED。 */
export function aggregateHealth(statuses: readonly HealthStatus[]): ServiceHealthView {
  if (statuses.length === 0) return 'NOT_PROBED';
  let worst: HealthStatus = 'UP';
  for (const s of statuses) if (HEALTH_WEIGHT[s] > HEALTH_WEIGHT[worst]) worst = s;
  return worst;
}

export interface SnapshotCounts {
  /** null = 该列没测到；不是 0 */
  readonly routes: number | null;
  readonly services: number | null;
  readonly instances: number | null;
  readonly routedServices: number;
  readonly unroutedServices: number;
  readonly danglingRoutes: number;
  readonly downInstances: number;
  readonly unknownInstances: number;
}

export interface GatewaySnapshot {
  readonly generatedAt: string;
  /** 三列各自的可信状态与年龄——UI 据此标注"这是哪一刻的、缓存了多久" */
  readonly columns: {
    readonly routes: { readonly state: Readout<unknown>['state']; readonly ageMs: number; readonly measuredAt: string | null };
    readonly services: { readonly state: Readout<unknown>['state']; readonly ageMs: number; readonly measuredAt: string | null };
    readonly health: { readonly state: Readout<unknown>['state']; readonly ageMs: number; readonly measuredAt: string | null };
  };
  readonly totals: SnapshotCounts;
  readonly services: readonly JoinedService[];
  readonly gaps: readonly Gap[];
  /** 三份上游各自的 note 原样端出，不重写、不稀释 */
  readonly notes: { readonly routes: string | null; readonly services: string | null; readonly health: string | null };
}

export interface JoinInput {
  readonly generatedAt: string;
  readonly routes: Readout<RoutesReadout>;
  readonly services: Readout<ServicesReadout>;
  readonly health: Readout<HealthReadout>;
}

/**
 * 纯函数 join：不取时间、不发网络、不读环境。所有随时间变的量都在入参里，判据可逐支验电。
 */
export function joinSnapshot(input: JoinInput): GatewaySnapshot {
  const { routes, services, health } = input;
  const gaps: Gap[] = [];

  // 列缺失先登记：下面每一格 null 都能在这里找到"为什么不知道"。
  for (const [column, readout] of [
    ['routes', routes],
    ['services', services],
    ['health', health],
  ] as const) {
    if (readout.state === 'unavailable') {
      gaps.push({ kind: 'column-unavailable', column, note: `${column} 这一列这次没测到，读数为「未测」，不是 0` });
    } else if (readout.state === 'stale' || readout.state === 'cached') {
      gaps.push({
        kind: 'stale-column',
        column,
        note: `${column} 这一列端出的是 ${readout.measuredAt ?? '未知时刻'} 的快照（${readout.state}），不是此刻的测量`,
      });
    }
  }

  const routeValue = columnHasValue(routes) ? routes.value : null;
  const servicesValue = columnHasValue(services) ? services.value : null;
  const healthValue = columnHasValue(health) ? health.value : null;

  // service id 全集：三列的并集，才能同时看见"注册了没路由"与"路由了没注册"两种错配。
  const ids = new Set<string>();
  const routesById = new Map<string, string[]>();
  for (const row of routeValue?.routes ?? []) {
    const sid = serviceIdFromUri(row.uri);
    if (sid === null) continue; // 直连 uri 不是 service id，不参与发现语义的 join，但总数仍计入 routes
    ids.add(sid);
    const list = routesById.get(sid) ?? [];
    list.push(row.id);
    routesById.set(sid, list);
  }
  const servicesById = new Map(servicesValue?.services.map((s) => [s.id, s]) ?? []);
  const healthById = new Map(healthValue?.services.map((s) => [s.id, s]) ?? []);
  for (const s of servicesById.keys()) ids.add(s);
  for (const s of healthById.keys()) ids.add(s);

  const joined: JoinedService[] = [];
  const unrouted: string[] = [];
  const dangling: string[] = [];
  const down: string[] = [];
  const unknown: string[] = [];
  let downInstances = 0;
  let unknownInstances = 0;

  for (const id of [...ids].sort((a, b) => a.localeCompare(b))) {
    const routeIds = routesById.get(id) ?? [];
    const regRow = servicesById.get(id);
    const healthRow = healthById.get(id);

    // 注册列没测到 → null（不知道）；测到了但没有这个 id → 0（真的没注册）
    const registeredInstances = columnHasValue(services) ? (regRow?.instances ?? 0) : null;
    const addresses = regRow?.addresses ?? [];

    const statuses = healthRow?.instances.map((i) => i.status) ?? [];
    const healthView: ServiceHealthView = columnHasValue(health)
      ? aggregateHealth(statuses)
      : 'NOT_MEASURED';
    const nDown = healthRow?.instances.filter((i) => i.status === 'DOWN').length ?? 0;
    const nUnknown = healthRow?.instances.filter((i) => i.status === 'UNKNOWN').length ?? 0;
    downInstances += nDown;
    unknownInstances += nUnknown;
    if (nDown > 0) down.push(id);
    if (nUnknown > 0) unknown.push(id);

    const hasRoute = routeIds.length > 0;
    const isRegistered = (regRow?.instances ?? 0) > 0 || servicesById.has(id);
    let classification: JoinedService['classification'];
    if (hasRoute && !isRegistered && columnHasValue(services)) {
      classification = 'dangling';
      dangling.push(id);
    } else if (!hasRoute && isRegistered && columnHasValue(routes)) {
      classification = 'unrouted';
      unrouted.push(id);
    } else if (healthView === 'DOWN') {
      classification = 'routed-down';
    } else if (healthView === 'UNKNOWN' || healthView === 'NOT_MEASURED' || nUnknown > 0) {
      classification = 'routed-degraded';
    } else {
      classification = 'routed-healthy';
    }

    joined.push({
      id,
      routeIds,
      registeredInstances,
      addresses,
      health: healthView,
      downInstances: nDown,
      unknownInstances: nUnknown,
      classification,
    });
  }

  if (unrouted.length > 0) {
    gaps.push({
      kind: 'unrouted-service',
      ids: unrouted,
      note: `注册中心有、路由表没有：${unrouted.join('、')}。门不为它们生成路由（未纳管），访问其路径应是无路由响应`,
    });
  }
  if (dangling.length > 0) {
    gaps.push({
      kind: 'dangling-route',
      ids: dangling,
      note: `路由表指向、注册中心没有：${dangling.join('、')}。这条路由此刻没有可转发实例`,
    });
  }
  if (down.length > 0) gaps.push({ kind: 'instance-down', ids: down, note: `有实例实测 DOWN：${down.join('、')}` });
  if (unknown.length > 0) {
    gaps.push({
      kind: 'instance-unknown',
      ids: unknown,
      note: `有实例没答上（UNKNOWN）：${unknown.join('、')}。没答不等于死了，别当 DOWN 处理`,
    });
  }
  gaps.push({
    kind: 'non-atomic',
    note: `三列各自的 measuredAt 不同（routes=${routes.measuredAt ?? '未测'} / services=${services.measuredAt ?? '未测'} / health=${health.measuredAt ?? '未测'}），这是三张带各自日期的事实拼成的图，不是同一瞬间的原子快照`,
  });

  const anyRegistered = servicesValue?.services ?? [];
  const instanceTotal = columnHasValue(services)
    ? anyRegistered.reduce((sum, s) => sum + s.instances, 0)
    : null;

  return {
    generatedAt: input.generatedAt,
    columns: {
      routes: { state: routes.state, ageMs: routes.ageMs, measuredAt: routes.measuredAt },
      services: { state: services.state, ageMs: services.ageMs, measuredAt: services.measuredAt },
      health: { state: health.state, ageMs: health.ageMs, measuredAt: health.measuredAt },
    },
    totals: {
      routes: columnHasValue(routes) ? (routeValue?.total ?? 0) : null,
      services: columnHasValue(services) ? (servicesValue?.total ?? 0) : null,
      instances: instanceTotal,
      routedServices: joined.filter((j) => j.routeIds.length > 0).length,
      unroutedServices: unrouted.length,
      danglingRoutes: dangling.length,
      downInstances,
      unknownInstances,
    },
    services: joined,
    gaps,
    notes: {
      routes: routeValue?.note ?? null,
      services: servicesValue?.note ?? null,
      health: healthValue?.note ?? null,
    },
  };
}
