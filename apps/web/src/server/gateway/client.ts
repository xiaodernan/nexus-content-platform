/**
 * 网关三个 `/platform/*` 读数的取数客户端（SC-40 的 I/O 边界）。
 *
 * 这一层把三件事收在一处，且都能注入替身、不连真网关就判据：
 *
 * 1. **超时**：每次尝试自带 `AbortSignal.timeout`，绝不无限等。网关自己给 health 探测设了 1500ms
 *    deadline（SC-36），站在它外面的面板若不限时，一个黑洞下游能把管理页挂死。
 * 2. **只重试该重试的**（计网正确性）：网络错、超时、5xx、429 才退避重试；4xx（尤其 auth 401）
 *    和**形状不认识**不重试——重试不会让一个坏形状变好，也不会让一把错钥匙开门。退避用计网那片的
 *    全抖动，避免 N 个浏览器同步重试砸成惊群。
 * 3. **失败降级不画 0**：一次尝试全失败时，优先端出缓存里的旧值并标 `stale`；连旧值都没有就
 *    `unavailable`（`value=null`）。**绝不**把"没测到"变成一份空表——那会让运维去查不存在的事故。
 *
 * 并发扇出用 `allSettled`：三列各自成功/失败互不拖累，一列挂了另两列照样显示。这与
 * `ServiceHealthProbe` 用 `flatMap` 并发探实例是同一句"一个坏实例不该挡住其余读数"。
 *
 * 可注入：`fetchImpl` / `sleep` / `now` / `clock` / `rng` / `shared`。判据里喂假 fetch 与 sleep(0)，
 * 就能逐支验超时、重试次数、4xx 不重试、部分失败、stale 兜底，全程零网络、零真实等待。
 */

import { fullJitter, type BackoffOptions } from './backoff';
import { BoundedCache } from './cache';
import {
  normalizeHealth,
  normalizeRoutes,
  normalizeServices,
  type HealthReadout,
  type Readout,
  type RoutesReadout,
  type ServicesReadout,
} from './types';

/** 最小 fetch 形状：判据的假实现只需满足这三个成员，不必造一个真的 Response。 */
export type GatewayFetch = (
  url: string,
  init: { signal: AbortSignal; headers: Record<string, string> },
) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

export interface SharedCache {
  get(key: string): Promise<{ readonly value: string; readonly storedAtMs: number; readonly storedAt: string } | null>;
  set(key: string, value: string, ttlMs: number): Promise<void>;
}

export interface SharedCacheProbe {
  readonly driver: 'in-process' | 'redis';
  readonly lastError: string | null;
  readonly fallbacks: number;
}

interface Payload<T> {
  readonly value: T;
  readonly measuredAt: string;
}

/**
 * §SHARED-1（ADR-0156）：缓存条目的**来源**，随值一起穿过 singleflight。
 * 为什么塞进值里而不是用闭包变量/边带 Map：同键并发时 follower 不执行 loader、只 await leader 的
 * 同一个 promise；把 source 放进 value，leader/follower 拿到的是同一份、同一个来源标记，零边带状态、
 * clear 时无需额外清理。'shared' = 命中另一实例早先写入的共享缓存（没问上游），'upstream' = 这次真问了。
 */
type Loaded<T> = Payload<T> & { readonly source: 'shared' | 'upstream' };

type Normalizer<T> = (raw: unknown) => T | null;

class NotRetryable extends Error {}

export interface GatewayClientOptions {
  readonly baseUrl: string;
  readonly timeoutMs?: number;
  readonly maxAttempts?: number;
  readonly backoff?: BackoffOptions;
  readonly cacheTtlMs?: number;
  readonly maxCacheEntries?: number;
  readonly fetchImpl?: GatewayFetch;
  readonly sleep?: (ms: number) => Promise<void>;
  readonly now?: () => number;
  readonly clock?: () => string;
  readonly rng?: () => number;
  readonly shared?: SharedCache;
  readonly sharedProbe?: { recordError(error: unknown): void };
}

export interface GatewayClient {
  loadAll(): Promise<{
    readonly routes: Readout<RoutesReadout>;
    readonly services: Readout<ServicesReadout>;
    readonly health: Readout<HealthReadout>;
  }>;
  describe(): {
    readonly baseUrl: string;
    readonly timeoutMs: number;
    readonly maxAttempts: number;
    readonly cacheTtlMs: number;
    readonly shared: SharedCacheProbe;
  };
  clearCache(): void;
}

const DEFAULTS = {
  timeoutMs: 2500,
  maxAttempts: 3,
  backoff: { baseMs: 120, capMs: 900 } as BackoffOptions,
  cacheTtlMs: 4000,
  maxCacheEntries: 8,
};

/** baseUrl 归一化：去掉尾斜杠，判据与生产同一口径，不会拼出 `//platform/routes`。 */
export function normalizeBaseUrl(raw: string): string {
  return raw.trim().replace(/\/+$/, '');
}

export function createGatewayClient(options: GatewayClientOptions): GatewayClient {
  const baseUrl = normalizeBaseUrl(options.baseUrl);
  const timeoutMs = Math.max(50, options.timeoutMs ?? DEFAULTS.timeoutMs);
  const maxAttempts = Math.max(1, options.maxAttempts ?? DEFAULTS.maxAttempts);
  const backoff = options.backoff ?? DEFAULTS.backoff;
  const cacheTtlMs = Math.max(0, options.cacheTtlMs ?? DEFAULTS.cacheTtlMs);
  const now = options.now ?? Date.now;
  const clock = options.clock ?? (() => new Date().toISOString());
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const rng = options.rng ?? Math.random;
  const fetchImpl: GatewayFetch =
    options.fetchImpl ??
    ((url, init) => fetch(url, { ...init, cache: 'no-store' }) as unknown as Promise<{
      ok: boolean;
      status: number;
      json(): Promise<unknown>;
    }>);
  const cache = new BoundedCache<Loaded<unknown>>({
    maxEntries: options.maxCacheEntries ?? DEFAULTS.maxCacheEntries,
    ttlMs: cacheTtlMs,
    now,
    clock,
  });

  const sharedProbeState = { lastError: null as string | null, fallbacks: 0 };
  const shared = options.shared ?? null;

  async function readShared<T>(key: string): Promise<T | null> {
    if (!shared) return null;
    try {
      const hit = await shared.get(key);
      if (!hit) return null;
      // 共享缓存里的 JSON 可能坏掉（旧版本写的、被别的服务覆盖、手改过）。先认形状，
      // 不认识就当没命中，回退到直接问网关——与 types.ts 的归一化同一句"读不出不等于有"。
      const parsed: unknown = JSON.parse(hit.value);
      if (typeof parsed !== 'object' || parsed === null) return null;
      const obj = parsed as Record<string, unknown>;
      if (!('value' in obj) || !('measuredAt' in obj)) return null;
      return parsed as T;
    } catch (error) {
      sharedProbeState.lastError = error instanceof Error ? error.message : String(error);
      sharedProbeState.fallbacks += 1;
      options.sharedProbe?.recordError(error);
      return null; // fail-open：线路坏了不拖垮读数，退回进程内/直接问网关
    }
  }

  async function writeShared(key: string, payload: Payload<unknown>): Promise<void> {
    if (!shared) return;
    try {
      await shared.set(key, JSON.stringify(payload), cacheTtlMs);
    } catch (error) {
      sharedProbeState.lastError = error instanceof Error ? error.message : String(error);
      sharedProbeState.fallbacks += 1;
      options.sharedProbe?.recordError(error);
    }
  }

  async function fetchOnce<T>(path: string, normalize: Normalizer<T>): Promise<Payload<T>> {
    let lastStatus: number | null = null;
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      try {
        const res = await fetchImpl(`${baseUrl}${path}`, {
          signal: AbortSignal.timeout(timeoutMs),
          headers: { accept: 'application/json' },
        });
        lastStatus = res.status;
        // 4xx 不重试：错钥匙开一百次门还是关的；429 例外（限流，退避后可能放行）
        if (!res.ok && res.status < 500 && res.status !== 429) {
          throw new NotRetryable(`HTTP ${res.status}`);
        }
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const raw = await res.json();
        const value = normalize(raw);
        // 形状不认识不重试：同一份坏 JSON 再问多少次仍是坏的。
        if (value === null) throw new NotRetryable('回执形状不认识');
        return { value, measuredAt: clock() };
      } catch (error) {
        if (error instanceof NotRetryable) throw error;
        if (attempt === maxAttempts - 1) {
          const detail = lastStatus === null ? '网络错误或超时' : `HTTP ${lastStatus}`;
          throw new Error(`${detail}（重试 ${maxAttempts} 次仍未答上）`);
        }
        await sleep(fullJitter(attempt, backoff.baseMs, backoff.capMs, rng));
      }
    }
    throw new Error('unreachable');
  }

  function unavailable<T>(message: string): Readout<T> {
    return {
      state: 'unavailable',
      value: null,
      measuredAt: null,
      fetchedAt: clock(),
      ageMs: 0,
      note: message,
    };
  }

  async function load<T>(key: string, path: string, normalize: Normalizer<T>): Promise<Readout<T>> {
    const hit = cache.get(key);
    if (hit && !hit.expired) {
      return {
        state: 'cached',
        value: hit.value.value as T,
        measuredAt: hit.value.measuredAt,
        fetchedAt: hit.storedAt,
        ageMs: hit.ageMs,
        note: `缓存里 ${hit.storedAt} 的快照（距今 ${hit.ageMs}ms），不是此刻的测量`,
      };
    }

    try {
      // singleflight：同键并发只让第一发真正加载，后来者等同一个 promise。
      // §SHARED-1：来源（shared/upstream）随 value 一起穿过这个 promise——follower 不跑 loader，
      // 但 await 到的是 leader 同一份带 source 的值，所以所有人都能如实标注，无需边带状态。
      const entry = await cache.getOrLoad(key, async (): Promise<Loaded<unknown>> => {
        const fromShared = await readShared<Payload<T>>(key);
        if (fromShared && normalize(fromShared.value as unknown)) {
          // 命中另一实例早先写入的共享缓存：没问上游，measuredAt 是它当初测的时刻。
          return { ...fromShared, source: 'shared' } as Loaded<unknown>;
        }
        const freshPayload = await fetchOnce(path, normalize);
        // 共享里只存 Payload（不含 source）——source 是本进程对"这次怎么拿到"的描述，不是数据本身；
        // 下次别的实例读出来会据实标 shared，不把本实例的 upstream 记忆带过去。
        await writeShared(key, freshPayload as Payload<unknown>);
        return { ...freshPayload, source: 'upstream' } as Loaded<unknown>;
      });

      if (entry.value.source === 'shared') {
        // 账本诚实（types.ts:21 'cached'）：这是共享缓存里带 measuredAt 的旧事实，不是这次问上游的结果。
        // ageMs 仍是"本进程持有这份值的时长"（entry 是本进程缓存条目），measuredAt 如实透传上游当初的时刻。
        return {
          state: 'cached',
          value: entry.value.value as T,
          measuredAt: entry.value.measuredAt,
          fetchedAt: entry.storedAt,
          ageMs: entry.ageMs,
          note: `命中别的实例早先写入共享缓存的快照（测量于 ${entry.value.measuredAt}，本进程持有 ${entry.ageMs}ms），并非本次向网关请求所得`,
        };
      }
      return {
        state: 'fresh',
        value: entry.value.value as T,
        measuredAt: entry.value.measuredAt,
        fetchedAt: entry.storedAt,
        ageMs: entry.ageMs,
        note: '这次从上游读到的快照',
      };
    } catch (error) {
      // 上游没答上：端出旧值并标 stale；连旧值都没有就 unavailable，绝不画 0。
      const old = cache.peek(key);
      const message = error instanceof Error ? error.message : String(error);
      if (old) {
        return {
          state: 'stale',
          value: old.value.value as T,
          measuredAt: old.value.measuredAt,
          fetchedAt: old.storedAt,
          ageMs: old.ageMs,
          note: `上游没答上（${message}），端出 ${old.storedAt} 的旧快照，不是此刻的测量`,
        };
      }
      return unavailable(`这次没测到：${message}`);
    }
  }

  return {
    async loadAll() {
      // 并发扇出 + allSettled：三列互不拖累。load() 自身已把可预期的上游失败降级成 Readout，
      // 但 normalize / clock / 缓存里的意外异常仍可能 reject —— 那种情况也必须只废掉那一列，
      // 而不是让 Promise.all 把另外两列一起带走。这就是用 allSettled 而非 all 的全部理由。
      const [routes, services, health] = await Promise.allSettled([
        load('routes', '/platform/routes', normalizeRoutes),
        load('services', '/platform/services', normalizeServices),
        load('health', '/platform/health', normalizeHealth),
      ]);
      return {
        routes: routes.status === 'fulfilled' ? routes.value : unavailable<RoutesReadout>('路由列读取时发生意外错误'),
        services: services.status === 'fulfilled' ? services.value : unavailable<ServicesReadout>('注册列读取时发生意外错误'),
        health: health.status === 'fulfilled' ? health.value : unavailable<HealthReadout>('健康列读取时发生意外错误'),
      };
    },
    describe() {
      return {
        baseUrl,
        timeoutMs,
        maxAttempts,
        cacheTtlMs,
        shared: {
          driver: shared ? 'redis' : 'in-process',
          lastError: sharedProbeState.lastError,
          fallbacks: sharedProbeState.fallbacks,
        },
      };
    },
    clearCache() {
      cache.clear();
    },
  };
}
