import { aiServiceUrl } from './client';

/**
 * §CACHE-2 把 ai-service 的 `/v1/ai/cache-stats` 读成 web 侧的形状。
 *
 * ## 为什么要校验，而不是 `await res.json() as X`
 *
 * 这份报文来自**另一个进程**，它的字段会随 ai-service 的版本走。`as` 只是让编译器闭嘴：
 * 真到了字段缺失的那天，`undefined` 会一路传进渲染，页面上出现 `NaN%` —— 那不是
 * "读数不对"，那是**编了一个读数**。所以下面逐字段校验，形状不对就当"这次没测到"。
 *
 * ## 三处 `null` 的意义（与 ADR-0262 同一口径）
 *
 * - `prefix.reuseRate`：一次请求都没有 → `null`。`0` 会读成"试过但全没命中"。
 * - `provider.reportedHitRate`：没有报过账的样本 → `null`。
 * - `appCache`：**整个对象可以是 `null`**（缓存没启用）。这与"启用了但 0 命中"是两件事，
 *   画成四个 0 就是那一整片在防的谎。
 */

/** 超时。这是运维面读数，不是业务请求：慢一点没关系，卡住首页不行。 */
export const CACHE_STATS_TIMEOUT_MS = 3_000;

export interface PrefixStats {
  requests: number;
  reused: number;
  uniquePrefixes: number;
  capacity: number;
  evictions: number;
  /** null = 一次请求都没有；不是 0%。 */
  reuseRate: number | null;
}

export interface AppCacheStats {
  enabled: boolean;
  backend: string;
  hits: number;
  misses: number;
  stores: number;
  storesFailed: number;
  evictions: number;
  /** null = 还没有命中/未命中样本。 */
  hitRate: number | null;
  shared: boolean | null;
  degraded: boolean | null;
  namespace: string | null;
}

export interface ProviderStats {
  reported: number;
  missing: number;
  cachedTokensTotal: number;
  promptTokensTotal: number;
  /** null = 没有报过账的样本。分母只算报过账的那几次。 */
  reportedHitRate: number | null;
}

export interface AiCacheReadout {
  prefix: PrefixStats;
  /** null = 应用级缓存未启用（不是"启用了但零命中"）。 */
  appCache: AppCacheStats | null;
  provider: ProviderStats;
  /** web 侧取到这份读数的时刻（ISO）。**不是** ai-service 的采样时刻——那份是它自报的进程内计数。 */
  measuredAt: string;
}

export type CacheStatsResult =
  | { ok: true; readout: AiCacheReadout }
  | { ok: false; error: string };

function num(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function numOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function boolOrNull(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null;
}

function strOrNull(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/**
 * **上游报文的核心形状**：`prefix` / `provider` 两段是对象、关键字段是数字，
 * `appCache` 是 null 或对象。
 *
 * 注意这里**不查 `measuredAt`**——那个时间戳是 web 侧取到时自己打的
 * （上游只报进程内计数，没有"采样时刻"这个东西）。第一版把两者混在一个校验里，
 * 结果每一份真实报文都过不了：上游永远不带 `measuredAt`。这不是小疏忽——
 * 它会让面板在真机上永远显示"形状不认识"，而单测只要不喂真报文就发现不了。
 */
function hasReadoutCore(body: unknown): body is Record<string, unknown> {
  const root = record(body);
  if (!root) return false;
  const prefix = record(root.prefix);
  const provider = record(root.provider);
  if (!prefix || !provider) return false;
  if (root.appCache !== null && !record(root.appCache)) return false;
  for (const key of ['requests', 'reused', 'uniquePrefixes', 'capacity', 'evictions']) {
    if (typeof prefix[key] !== 'number') return false;
  }
  for (const key of ['reported', 'missing', 'cachedTokensTotal', 'promptTokensTotal']) {
    if (typeof provider[key] !== 'number') return false;
  }
  return true;
}

/**
 * **归一化之后的读数形状**（面板消费的那一份）：核心形状 + `measuredAt` 字符串。
 *
 * 与 `hasReadoutCore` 分开的两个用处：本文件的 `fetchAiCacheStats` 校验的是上游原报文
 * （没有 measuredAt），面板校验的是自家 API route 端出的归一化读数（有 measuredAt）。
 * 一个校验函数服侍两个形状，必然有一边被放松——那正是上面那个 bug 的成因。
 */
export function isKnownReadout(body: unknown): body is AiCacheReadout {
  return hasReadoutCore(body) && typeof (body as Record<string, unknown>).measuredAt === 'string';
}

/** 把 ai-service 的 snake_case 报文整成 web 侧的 camelCase 形状。 */
function normalize(body: Record<string, unknown>, measuredAt: string): AiCacheReadout {
  const prefix = record(body.prefix)!;
  const provider = record(body.provider)!;
  const appCacheRaw = body.appCache === null ? null : record(body.appCache);

  return {
    measuredAt,
    prefix: {
      requests: num(prefix.requests),
      reused: num(prefix.reused),
      uniquePrefixes: num(prefix.uniquePrefixes),
      capacity: num(prefix.capacity),
      evictions: num(prefix.evictions),
      reuseRate: numOrNull(prefix.reuseRate),
    },
    // 缓存没启用时 ai-service 给 null；这里保持 null，不补一个假对象
    appCache:
      appCacheRaw === null
        ? null
        : {
            enabled: appCacheRaw.enabled === true,
            backend: strOrNull(appCacheRaw.backend) ?? 'unknown',
            hits: num(appCacheRaw.hits),
            misses: num(appCacheRaw.misses),
            stores: num(appCacheRaw.stores),
            storesFailed: num(appCacheRaw.stores_failed),
            evictions: num(appCacheRaw.evictions),
            // ai-service 报的是 hit_rate（snake）；缺失就是 null，不写成 0
            hitRate: numOrNull(appCacheRaw.hit_rate),
            shared: boolOrNull(appCacheRaw.shared),
            degraded: boolOrNull(appCacheRaw.degraded),
            namespace: strOrNull(appCacheRaw.namespace),
          },
    provider: {
      reported: num(provider.reported),
      missing: num(provider.missing),
      cachedTokensTotal: num(provider.cachedTokensTotal),
      promptTokensTotal: num(provider.promptTokensTotal),
      reportedHitRate: numOrNull(provider.reportedHitRate),
    },
  };
}

/**
 * 取一次三层读数。
 *
 * 失败面**三种分开说**（与 `/admin/gateway`、`/admin/discover-cache` 同一口径）：
 * 没配 ai-service 地址 / 连不上 / 形状不认识。三者对运维的含义完全不同，
 * 合并成一句"读取失败"等于让人从零开始查。
 */
export async function fetchAiCacheStats(fetchImpl: typeof fetch = fetch): Promise<CacheStatsResult> {
  const base = aiServiceUrl();
  if (!base) {
    return { ok: false, error: '未配置 NEXUS_AI_SERVICE_URL（启动 AI Service 或补上地址）' };
  }
  let response: Response;
  try {
    response = await fetchImpl(`${base}/v1/ai/cache-stats`, {
      signal: AbortSignal.timeout(CACHE_STATS_TIMEOUT_MS),
      cache: 'no-store',
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return { ok: false, error: `连不上 AI Service（${detail}）` };
  }
  if (!response.ok) {
    return { ok: false, error: `AI Service 回了 HTTP ${response.status}` };
  }
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return { ok: false, error: 'AI Service 的响应不是 JSON' };
  }
  if (!hasReadoutCore(body)) {
    return { ok: false, error: '读数形状不认识（ai-service 版本可能不匹配）' };
  }
  // `hasReadoutCore` 只查上游原报文（没有 measuredAt），这一刻手上还是 snake_case
  // （`hit_rate` / `stores_failed`）。所以先经 `unknown` 回到原始字典再走 `normalize`——
  // 直接 `as Record<...>` 会被编译器挡住，那道挡住是对的。
  return { ok: true, readout: normalize(body as unknown as Record<string, unknown>, new Date().toISOString()) };
}
