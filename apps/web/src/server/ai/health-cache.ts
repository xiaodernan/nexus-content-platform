import type { HealthResponse } from '@nexus/schemas';
import { fetchAiServiceHealth } from '@/server/ai/client';

/**
 * §CACHE-1 · ai-service `/healthz` 的短 TTL 缓存 + 并发去重（ADR-0171）。
 *
 * ## 为什么需要
 *
 * `getAiCapabilities()` 被 5 处调用，其中 `/api/ai/run`、`characters/.../chat`、`submit.ts`
 * 是热路径——每一次 AI 请求都要额外发一次跨服务 HTTP `/healthz`，只为问「provider 还是 real 吗」。
 * 真机实测（2026-11-12，20 次）：P50=31ms，但 **P95=1374ms**（贴近 1.5s 超时上限）——
 * 一次长尾抖动会把整个 `/api/ai/run` 拖慢 1.4s，纯粹耗在能力探测上。缓存把这条长尾从
 * 「每次请求都可能踩」压到「TTL 窗口内只有首请求踩一次」。
 *
 * ## 正确性优先于命中率（四条不变量）
 *
 * 1. **失败不缓存**：`/healthz` 不可达 / 抛异常 / 契约违约（返回 `null`）时**不写缓存**，
 *    下一次调用立即重试——provider 刚恢复时不会因陈旧缓存继续误判 DEMO、也不会把请求
 *    发给已下线的 service（§159 不静默降级、不编造状态）。
 * 2. **并发去重**：同一 tick 的 N 个请求共享同一个在途 Promise（`inFlight`），
 *    不会惊群式各发一次；结果（含失败）对所有等待者一致，失败后 `inFlight` 清空供重试。
 * 3. **单调时钟防回拨**：用 `performance.now()`（单调）而不是 `Date.now()`（墙钟可能回拨
 *    导致缓存永不过期）；可通过 `now` 注入以单测钉 TTL 边界。
 * 4. **短 TTL 且可配**：默认 5s，覆盖「一次 AI 请求周期内 provider 状态基本稳定」，
 *    又足够短到 provider 挂了能在秒级被发现。零命中路径的开销只是两次比较。
 *
 * ## 边界
 *
 * 缓存的是**成功**的 `HealthResponse`（值语义，不缓存 `null`）。首页 `page.tsx` 自己
 * prefetched `/healthz` 后传给 `getAiCapabilities(health)`，走的是快路径，不经过这里，
 * 因此不会二次探测、也不会被缓存的陈旧值影响首屏渲染。
 */

/** 默认 5 秒：足够吸收一次长尾抖动，又短到 provider 故障秒级可见。 */
export const DEFAULT_HEALTH_TTL_MS = 5_000;

type Clock = () => number;
type HealthFetcher = (fetchImpl: typeof fetch) => Promise<HealthResponse | null>;

interface CacheEntry {
  value: HealthResponse;
  /** 用单调时钟记的写入时刻，单位 ms */
  writtenAt: number;
}

// 模块级单例：web 进程内所有 `getAiCapabilities()` 共享同一份缓存与同一条在途 Promise。
let entry: CacheEntry | null = null;
let inFlight: Promise<HealthResponse | null> | null = null;

/**
 * 取 ai-service 健康状态，成功结果在 TTL 内复用。
 *
 * @param fetchImpl 透传给 `fetchAiServiceHealth` 的 fetch（测试注入）
 * @param now      单调时钟（测试注入，默认 `performance.now`）
 * @param ttlMs    缓存有效期（测试注入，默认 5s）
 */
export function getCachedAiHealth(
  fetchImpl: typeof fetch = fetch,
  now: Clock = () => performance.now(),
  ttlMs: number = DEFAULT_HEALTH_TTL_MS,
): Promise<HealthResponse | null> {
  // TTL 命中：只比两次数，不碰网络。失败（null）从不写 entry，所以这里命中的一定是成功值。
  if (entry && now() - entry.writtenAt < ttlMs) {
    return Promise.resolve(entry.value);
  }
  // 并发去重：已有在途请求，所有调用者等同一个 Promise，不各自发一次。
  if (inFlight) return inFlight;

  const read: HealthFetcher = fetchAiServiceHealth;
  const startedAt = now();
  inFlight = read(fetchImpl)
    .then((value) => {
      // 仅成功值入缓存；null（不可达 / 契约违约）绝不缓存，供下一次立即重试。
      if (value !== null) {
        entry = { value, writtenAt: startedAt };
      }
      return value;
    })
    .finally(() => {
      // 无论成败都清在途标记：成功则后续走 TTL 命中，失败则下一次可立即重试。
      inFlight = null;
    });
  return inFlight;
}

/** 仅供测试隔离：清空成功缓存与在途标记。生产代码路径不调用。 */
export function resetHealthCache(): void {
  entry = null;
  inFlight = null;
}
