/**
 * Java 生产者那一侧的线路读数门面（§SC-58）。
 *
 * 端点是 domain-service 上 §SC-55 加的 `GET /api/v1/realtime/stats`——
 * `{wireChannel, maxFrameBytes, publishedTotal, tooLargeDropped, redisFailures}`。
 * 本面板轮询时只问一次（GET 只读计数、零写库、无缓存）。
 *
 * 三条纪律，与 `gateway/client.ts` 那一套同一口径：
 * - **fail-open**：Java 没在跑 / 探针挂 / 回执形状不认识 → `null`。
 *   不假装拿到数，也不改写成 0——"接了但全是 0"和"没拿到"在这页必须是两档。
 * - **只收形状**：不认识多余字段保留原样，**必须**带的五个字段一个不能缺、
 *   计数必须是有限非负数（`NaN` 会被 `Number.isFinite` 挡下）。
 * - **超时**：`AbortSignal.timeout(3000)`——一个 Java 探针 hang 不住 web 轮询请求。
 *
 * 未鉴权的理由同 domain-service 的 `/api/v1/realtime/stats`：只带计数、不带载荷；
 * 网关侧不受本页信任边界保护的另一层是 `SecurityConfig`——那边仍然是默认拒绝，
 * 本端点在 web 的 admin 门后（role=admin）再挡一次。
 */
export type BreakerState = 'CLOSED' | 'OPEN' | 'HALF_OPEN' | null;

export interface JavaWireStats {
  wireChannel: string;
  maxFrameBytes: number;
  publishedTotal: number;
  tooLargeDropped: number;
  redisFailures: number;
  breakerState?: BreakerState;
}

const DEFAULT_URL = 'http://127.0.0.1:8082/api/v1/realtime/stats';
const DEFAULT_ACTUATOR_URL = 'http://127.0.0.1:8082/actuator/circuitbreakers';

const BREAKER_STRINGS = new Set(['CLOSED', 'OPEN', 'HALF_OPEN']);

export function isJavaWireStats(value: unknown): value is JavaWireStats {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  if (typeof v.wireChannel !== 'string' || v.wireChannel.trim().length === 0) return false;
  for (const key of ['maxFrameBytes', 'publishedTotal', 'tooLargeDropped', 'redisFailures'] as const) {
    const n = v[key];
    if (typeof n !== 'number' || !Number.isFinite(n) || n < 0) return false;
  }
  if ((v.maxFrameBytes as number) <= 0) return false;
  if (v.breakerState !== undefined) {
    if (v.breakerState === null) {
      // 部署把断路器关了（NEXUS_FEIGN_BREAKER=false）：合法值，如实报 null
      return true;
    }
    if (typeof v.breakerState !== 'string' || !BREAKER_STRINGS.has(v.breakerState)) {
      return false;
    }
  }
  return true;
}

export async function fetchJavaWireStats(): Promise<JavaWireStats | null> {
  const url = process.env.NEXUS_JAVA_WIRE_STATS_URL?.trim() || DEFAULT_URL;
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(3_000),
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const data: unknown = await res.json();
    if (!isJavaWireStats(data)) return null;
    return {
      wireChannel: data.wireChannel,
      maxFrameBytes: data.maxFrameBytes,
      publishedTotal: data.publishedTotal,
      tooLargeDropped: data.tooLargeDropped,
      redisFailures: data.redisFailures,
      ...(data.breakerState === undefined ? {} : { breakerState: data.breakerState }),
    };
  } catch {
    return null;
  }
}

/**
 * `/actuator/circuitbreakers` 读数门面（§SC-64）。这次是 Spring Boot actuator 原生物——
 * Java 自己报断路器状态（不只是 Feign-wiring-name-aware 的 `ai-service`）。
 *
 * 形状固定（Boot 3.x 原样的 `{"circuitBreakers":{"<name>":{...}}}`）。
 * 我们只放行 `ai-service`（目前唯一的一个 breaker）；
 * 不认识的不要盲追 —— 否则 gateway 在机器上有多个 instance，web 不区分这就动摇"
 * 这一台 domain-service"的身份了。
 */
export interface JavaActuatorBreakerEntry {
  name: string;
  /** 原样透传断路器的状态字（CLOSED / OPEN / HALF_OPEN / DISABLED /  future: ...）。 */
  state: string;
  failureRate: string;
  slowCallRate: string;
  failureRateThreshold: string;
  slowCallRateThreshold: string;
  bufferedCalls: number;
  failedCalls: number;
  slowCalls: number;
  slowFailedCalls: number;
  notPermittedCalls: number;
}

export async function fetchJavaActuatorBreakers(): Promise<JavaActuatorBreakerEntry[] | null> {
  const url = process.env.NEXUS_JAVA_BREAKERS_URL?.trim() || DEFAULT_ACTUATOR_URL;
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(3_000),
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const data: unknown = await res.json();
    if (typeof data !== 'object' || data === null) return null;
    const circuitBreakers = (data as { circuitBreakers?: unknown }).circuitBreakers;
    if (typeof circuitBreakers !== 'object' || circuitBreakers === null) return null;
    const entries: JavaActuatorBreakerEntry[] = [];
    for (const [name, raw] of Object.entries(circuitBreakers)) {
      if (typeof raw !== 'object' || raw === null) continue;
      const b = raw as Record<string, unknown>;
      const bufferedCalls = typeof b.bufferedCalls === 'number' ? b.bufferedCalls : NaN;
      const failedCalls = typeof b.failedCalls === 'number' ? b.failedCalls : NaN;
      const slowCalls = typeof b.slowCalls === 'number' ? b.slowCalls : NaN;
      const slowFailedCalls = typeof b.slowFailedCalls === 'number' ? b.slowFailedCalls : NaN;
      const notPermittedCalls = typeof b.notPermittedCalls === 'number' ? b.notPermittedCalls : NaN;
      if ([bufferedCalls, failedCalls, slowCalls, slowFailedCalls, notPermittedCalls].some((n) => !Number.isFinite(n))) continue;
      if (typeof b.state !== 'string' || b.state.trim().length === 0) continue;
      if (typeof b.failureRate !== 'string' || typeof b.slowCallRate !== 'string') continue;
      if (typeof b.failureRateThreshold !== 'string' || typeof b.slowCallRateThreshold !== 'string') continue;
      if (!/^[a-zA-Z0-9._-]+$/.test(name)) continue;   // 断线垃圾 key 剔除
      entries.push({
        name,
        state: b.state,
        failureRate: b.failureRate,
        slowCallRate: b.slowCallRate,
        failureRateThreshold: b.failureRateThreshold,
        slowCallRateThreshold: b.slowCallRateThreshold,
        bufferedCalls,
        failedCalls,
        slowCalls,
        slowFailedCalls,
        notPermittedCalls,
      });
    }
    return entries;
  } catch {
    return null;
  }
}
