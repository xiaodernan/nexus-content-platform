/**
 * 网关三个 `/platform/*` 读数的契约与归一化（SC-40）。
 *
 * 为什么单独有这一层：这三个端点是**外部 HTTP**，回执形状不受本仓类型系统约束。直接 `as` 断言
 * 等于把"形状不认识"伪装成有数据——那正是 `ServiceHealthProbe` 里 `reportedStatus()` 花力气
 * 区分 UNKNOWN 的原因：**读不出的答案不是否定的答案，更不是 0**。所以这里的手写归一化在
 * 形状不认识时返回 `null`，交给上层记成 `unavailable`，绝不画一份编造的空表。
 *
 * 手写而非 zod：与 `ServiceHealthProbe.classify/reportedStatus` 同一套"自己解析、自己分类"的口径，
 * 零依赖、纯函数、可逐支验电。DTO 字段与网关源码逐字对齐（见各自的 *Controller / *Probe）：
 *   - routes    → `PlatformRoutesController`
 *   - services  → `PlatformServicesController`
 *   - health    → `ServiceHealthProbe`
 */

export type HealthStatus = 'UP' | 'DOWN' | 'UNKNOWN';

/** 一份读数此刻的可信状态。四态，缺一不可，各自都回答一个不同的运维问题。 */
export type ReadoutState =
  | 'fresh' // 这次真的问到了上游
  | 'cached' // 命中进程内/共享缓存，带 measuredAt 的旧事实
  | 'stale' // 上游没答上，端出的是上一次成功的值（不是这次的测量）
  | 'unavailable'; // 从未成功过，没有值可端 —— value 必须是 null，不许画 0

/** 统一信封：`value === null` 当且仅当 `state === 'unavailable'`，由构造处保证。 */
export interface Readout<T> {
  readonly state: ReadoutState;
  readonly value: T | null;
  /** 上游自报的测量时刻（ISO）；缓存命中时仍是**当初那份**的时刻，不是现在的 */
  readonly measuredAt: string | null;
  /** 本进程拿到这份值的时刻（ISO） */
  readonly fetchedAt: string;
  /** 这份值距 measuredAt 的毫秒数；缓存/陈旧时 > 0，新鲜时约 0 */
  readonly ageMs: number;
  /** 一句上屏的诚实说明：这份值是什么、不是什么 */
  readonly note: string;
}

export interface RouteRow {
  readonly id: string;
  readonly uri: string | null;
  readonly order: number;
}

export interface RoutesReadout {
  readonly measuredAt: string;
  readonly total: number;
  readonly routes: readonly RouteRow[];
  readonly note: string;
}

export interface ServiceRow {
  readonly id: string;
  readonly instances: number;
  readonly addresses: readonly string[];
}

export interface ServicesReadout {
  readonly measuredAt: string;
  readonly source: string;
  readonly total: number;
  readonly services: readonly ServiceRow[];
  readonly note: string;
}

export interface InstanceHealth {
  readonly uri: string;
  readonly status: HealthStatus;
  readonly httpStatus: number | null;
  readonly detail: string | null;
}

export interface ServiceHealth {
  readonly id: string;
  readonly up: boolean;
  readonly instances: readonly InstanceHealth[];
}

export interface HealthReadout {
  readonly measuredAt: string;
  readonly timeoutMs: number;
  readonly source: string;
  readonly allUp: boolean;
  readonly instances: number;
  readonly services: readonly ServiceHealth[];
  readonly note: string;
}

/* ── 手写归一化：形状不认识 → null（UNKNOWN，不发明事实） ─────────────────── */

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const str = (v: unknown): string | null => (typeof v === 'string' ? v : null);
const nonNegInt = (v: unknown): number | null =>
  typeof v === 'number' && Number.isInteger(v) && v >= 0 ? v : null;

/** `lb://nexus-api` → `nexus-api`；非 lb 的形状返回 null（那是直连 uri，不是 service id）。 */
export function serviceIdFromUri(uri: string | null): string | null {
  if (!uri) return null;
  const m = /^lb:\/\/([^/?#]+)/.exec(uri);
  return m?.[1] ?? null;
}

export function normalizeRoutes(raw: unknown): RoutesReadout | null {
  if (!isRecord(raw)) return null;
  const measuredAt = str(raw['measuredAt']);
  const total = nonNegInt(raw['total']);
  const note = str(raw['note']);
  const rows = raw['routes'];
  if (measuredAt === null || total === null || note === null || !Array.isArray(rows)) return null;
  const routes: RouteRow[] = [];
  for (const r of rows) {
    if (!isRecord(r)) return null;
    const id = str(r['id']);
    const order = nonNegInt(r['order']);
    if (id === null || order === null) return null;
    const uriRaw = r['uri'];
    routes.push({ id, uri: uriRaw === null ? null : str(uriRaw), order });
  }
  // total 是上游自报的行数；对不上说明这份快照自身不一致，当读不出处理，不替它补。
  if (routes.length !== total) return null;
  return { measuredAt, total, routes, note };
}

export function normalizeServices(raw: unknown): ServicesReadout | null {
  if (!isRecord(raw)) return null;
  const measuredAt = str(raw['measuredAt']);
  const source = str(raw['source']);
  const total = nonNegInt(raw['total']);
  const note = str(raw['note']);
  const rows = raw['services'];
  if (measuredAt === null || source === null || total === null || note === null || !Array.isArray(rows)) return null;
  const services: ServiceRow[] = [];
  for (const s of rows) {
    if (!isRecord(s)) return null;
    const id = str(s['id']);
    const instances = nonNegInt(s['instances']);
    const addressesRaw = s['addresses'];
    if (id === null || instances === null || !Array.isArray(addressesRaw)) return null;
    const addresses: string[] = [];
    for (const a of addressesRaw) {
      const address = str(a);
      if (address === null) return null;
      addresses.push(address);
    }
    // addresses 条数应等于 instances 自报；不一致是快照自身矛盾，不修、不猜。
    if (addresses.length !== instances) return null;
    services.push({ id, instances, addresses });
  }
  if (services.length !== total) return null;
  return { measuredAt, source, total, services, note };
}

function normalizeHealthStatus(v: unknown): HealthStatus | null {
  return v === 'UP' || v === 'DOWN' || v === 'UNKNOWN' ? v : null;
}

export function normalizeHealth(raw: unknown): HealthReadout | null {
  if (!isRecord(raw)) return null;
  const measuredAt = str(raw['measuredAt']);
  const timeoutMs = nonNegInt(raw['timeoutMs']);
  const source = str(raw['source']);
  const allUp = raw['allUp'];
  const instances = nonNegInt(raw['instances']);
  const note = str(raw['note']);
  const rows = raw['services'];
  if (
    measuredAt === null ||
    timeoutMs === null ||
    source === null ||
    typeof allUp !== 'boolean' ||
    instances === null ||
    note === null ||
    !Array.isArray(rows)
  ) {
    return null;
  }
  const services: ServiceHealth[] = [];
  let instanceTotal = 0;
  for (const s of rows) {
    if (!isRecord(s)) return null;
    const id = str(s['id']);
    const up = s['up'];
    const list = s['instances'];
    if (id === null || typeof up !== 'boolean' || !Array.isArray(list)) return null;
    const parsed: InstanceHealth[] = [];
    for (const i of list) {
      if (!isRecord(i)) return null;
      const uri = str(i['uri']);
      const status = normalizeHealthStatus(i['status']);
      if (uri === null || status === null) return null;
      const httpRaw = i['httpStatus'];
      const detailRaw = i['detail'];
      parsed.push({
        uri,
        status,
        httpStatus: httpRaw === null ? null : nonNegInt(httpRaw),
        detail: detailRaw === null || detailRaw === undefined ? null : str(detailRaw),
      });
    }
    instanceTotal += parsed.length;
    services.push({ id, up, instances: parsed });
  }
  if (instanceTotal !== instances) return null;
  return { measuredAt, timeoutMs, source, allUp, instances, services, note };
}
