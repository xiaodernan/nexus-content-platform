/**
 * 网关态势读数的门面：选驱动、建单例、对外只暴露一个 `getGatewayStatus()`（SC-40）。
 *
 * 沿用 `realtime/bus.ts` 与 `security/rateLimit.ts` 的同一套取舍，不另立规矩：
 * - **一个旋钮**：只看 `NEXUS_GATEWAY_URL`（网关在哪）与 `NEXUS_REDIS_URL`（要不要跨实例共享缓存），
 *   和实时总线、限流共用后者。没设网关 URL 时**不编造一份空拓扑**，而是让三列都 unavailable 并
 *   在 note 里说清"没配地址"——与 `/platform/services` 无 discovery client 时说"没接注册中心"同口径。
 * - **单例挂在 globalThis**：Next 开发态热重载、以及同一进程里多个 route handler，共享同一份缓存与
 *   singleflight，否则每次请求重建缓存 = 缓存形同虚设、惊群照旧。
 * - **Redis opt-in + fail-open**：设了 `NEXUS_REDIS_URL` 才给 client 接共享缓存；线路不通时 client 的
 *   `readShared/writeShared` 自己吞错回退，这里不因为 Redis 没起就拒绝服务（诊断页仍显示进程内读数）。
 *
 * 判据用 `setGatewayClientForTest()` 换掉单例，全程不连真网关、不连真 Redis。
 */

import { createGatewayClient, type GatewayClient, type GatewayClientOptions } from './client';
import { joinSnapshot, type GatewaySnapshot } from './snapshot';

export const GATEWAY_URL_ENV = 'NEXUS_GATEWAY_URL';
export const SHARED_CACHE_URL_ENV = 'NEXUS_REDIS_URL';

/**
 * 共享缓存的**有界重连退避**（§SC-50 / ADR-0125）。替代旧的 `retryStrategy: () => null`
 * （那让这条连接一旦断开——Redis 重启 / 网络抖 / 启动瞬间没连上——就**永久 fail-open 到进程结束**，
 * 是同仓 4 处 Redis 连接里唯一关掉自愈的）。
 *
 * 三条边界各有理由，且全部可纯函数验电（零真 Redis / 零 sleep）：
 * - **指数退避、封顶 capMs**：短暂抖动能自愈，又不让重连间隔无限增长；
 * - **maxAttempts 次后返回 `null` 放弃**：ADR-0125 明列的风险——Redis 长期不可达时不能无限空转
 *   打日志/CPU；放弃后保持既有 fail-open（退回进程内缓存），不比今天更差；
 * - **每步严格正数**：ioredis 把返回值当毫秒，0/负数/NaN 都是错误配置。
 *
 * 注意这是**契约**，不是"已验证真线路断后自愈"：真自愈需真 Redis + 网络抖动的窗口实测（见 ADR-0125）。
 */
export const SHARED_RETRY = { baseMs: 100, capMs: 1000, maxAttempts: 8 } as const;
export function sharedRedisRetryStrategy(
  attempt: number,
  cfg: { baseMs: number; capMs: number; maxAttempts: number } = SHARED_RETRY,
): number | null {
  // 线路字节/attempt 不可信：非正数或非有限值一律放弃，绝不把坏输入变成 0ms 重连风暴。
  if (!Number.isFinite(attempt) || !Number.isInteger(attempt) || attempt < 1 || attempt > cfg.maxAttempts) return null;
  const exponential = cfg.baseMs * 2 ** (attempt - 1);
  return Math.min(cfg.capMs, exponential);
}

interface GlobalStore {
  [key: string]: unknown;
}

const STORE_KEY = '__nexus_gateway_client_v1__';
const store = globalThis as GlobalStore;

/**
 * ioredis 构造缝的最小表面（§SC-50 / ADR-0125）：判据注入假构造器，逐支验喂给它的
 * 连接策略（尤其 `retryStrategy`），**不连真 Redis、不连真库、不 sleep**。
 * 生产缺省走动态 `import('ioredis')` 的真 `Redis`；形状只需 get/set/on，与 ioredis 版本解耦。
 */
export interface RedisCtor {
  new (
    url: string,
    options: Record<string, unknown>,
  ): {
    on(event: string, listener: (...args: any[]) => void): unknown;
    get(key: string): Promise<string | null>;
    set(key: string, value: string, mode: string, ms: number): Promise<unknown>;
  };
}

/** 极薄的 Redis 共享缓存实现：只用到 get/set with TTL，失败交给 client 的 fail-open 兜。 */
export async function makeRedisShared(
  url: string,
  ctor?: RedisCtor,
): Promise<{
  get(key: string): Promise<{ value: string; storedAtMs: number; storedAt: string } | null>;
  set(key: string, value: string, ttlMs: number): Promise<void>;
} | null> {
  try {
    const Redis = ctor ?? ((await import('ioredis')).Redis as unknown as RedisCtor);
    const client = new Redis(url, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false, // 线路不在时立即失败 → client fail-open，不排队拖住管理页
      // §SC-50：有界自愈（短暂抖动自动重连、长期不可达放弃不再空转），替代旧的恒 null 永不自愈。
      // 重连期读写仍即时 fail-open（离线队列关着），管理页不被拖住——原设计不变。
      retryStrategy: sharedRedisRetryStrategy,
    });
    client.on('error', () => {
      /* 只记不抛：client 的 readShared/writeShared 已各自记 lastError，这里不重复记账 */
    });
    const wrapped = {
      async get(key: string) {
        const value = await client.get(key);
        if (value === null) return null;
        // storedAt 用 Redis 里的写入时刻不可得；这里用读取时刻近似，client 侧会重新计时。
        // 诚实界限：共享缓存的 ageMs 是"从 Redis 取回到渲染"的耗时，不是"上游测量到此刻"的年龄，
        // measuredAt（上游自报）才是后者的真值，UI 以 measuredAt 为准。
        return { value, storedAtMs: Date.now(), storedAt: new Date().toISOString() };
      },
      async set(key: string, value: string, ttlMs: number) {
        await client.set(key, value, 'PX', Math.max(1, ttlMs));
      },
    };
    return wrapped;
  } catch {
    // ioredis 动态导入失败（裁剪部署里没装）不当致命：退回进程内缓存即可。
    return null;
  }
}

function createDefaultClient(): GatewayClient {
  const baseUrl = (process.env[GATEWAY_URL_ENV] ?? '').trim() || 'http://127.0.0.1:8080';
  const cacheUrl = (process.env[SHARED_CACHE_URL_ENV] ?? '').trim();

  let shared: GatewayClientOptions['shared'] = undefined;
  if (cacheUrl) {
    // 共享缓存是异步建的（动态 import），但 client 要同步拿到。这里用"首用即接"的懒代理：
    // get/set 在 promise 落定前返回 null/noop（fail-open 到进程内），落定后走 Redis。
    let sharedPromise: ReturnType<typeof makeRedisShared> | null = null;
    const ensure = () => {
      sharedPromise ??= makeRedisShared(cacheUrl);
      return sharedPromise;
    };
    shared = {
      async get(key: string) {
        const s = await ensure();
        return s ? s.get(key) : null;
      },
      async set(key: string, value: string, ttlMs: number) {
        const s = await ensure();
        if (s) await s.set(key, value, ttlMs);
      },
    };
    console.log(`[gateway] 共享缓存=Redis（${SHARED_CACHE_URL_ENV} 已设）；网关=${baseUrl}`);
  } else {
    console.log(`[gateway] 共享缓存=进程内（单实例默认；多实例设 ${SHARED_CACHE_URL_ENV} 跨实例共享）；网关=${baseUrl}`);
  }
  return createGatewayClient({ baseUrl, shared });
}

/** 取单例。首次调用读一次环境；之后热重载共享同一份缓存与在途合并。 */
export function getGatewayClient(): GatewayClient {
  if (!store[STORE_KEY]) store[STORE_KEY] = createDefaultClient();
  return store[STORE_KEY] as GatewayClient;
}

/** 判据用：注入替身客户端；传 undefined 恢复默认（会重新读一次环境）。 */
export function setGatewayClientForTest(client: GatewayClient | undefined): void {
  if (client === undefined) delete store[STORE_KEY];
  else store[STORE_KEY] = client;
}

/** 一次读取 = 三列并发取数 + join。对外唯一的业务入口。 */
export async function getGatewayStatus(): Promise<GatewaySnapshot> {
  const client = getGatewayClient();
  const readouts = await client.loadAll();
  return joinSnapshot({
    generatedAt: new Date().toISOString(),
    routes: readouts.routes,
    services: readouts.services,
    health: readouts.health,
  });
}
