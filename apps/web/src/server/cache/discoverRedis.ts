/**
 * `/api/discover` 的 anon 路共享缓存——进程内与 Redis 两个驱动，同一条契约。
 *
 * ## 为什么有两个驱动
 * 多实例部署里，每台实例各自跑 `discover()` 的代价 ∝ 实例数。Discover 是全站最热只读路径，
 * N 台就是 N 次同样的子查询。一个共享窗口（Redis 存的那份）正好把 15 秒内重复的读压成一次，
 * 实例再多也只有那一份 15 秒的底本。
 *
 * ## 驱动选择（与 NEXUS_REDIS_URL 共用，与 rate-limit 同一个旋钮）
 * - `NEXUS_REDIS_URL` 设了 → Redis；未设 → 进程内 (`TtlLru`)。两条路都只服务 anon path：
 *   cache key 按 `sort` 形状，没有 viewerId 这一格，`following` 等个人化路径永远不会进缓存。
 *
 * ## 取舍
 * - 不做 `WATCH`/事务——Discover 是幂等读；一次 `DEL` 的扇出由 publish 路径做完。
 * - 不把 `DiscoverResult` 之外的任何东西放进这个键：这是"读一把它的结果"，不是通用 store。
 * - Redis 连不上时**不退回内存**——`get` 端返回 `undefined`（读端自己重算），`driver()`
 *   报 `redis-unavailable`；降级是可测的一行日志而不是无聲退回。
 */
import { Redis } from 'ioredis';
import { TtlLru, type TtlLruOptions } from './ttlLru';
import type { DiscoverResult, DiscoverSort } from '@/server/domain/social';

export const DEFAULT_KEY_PREFIX = 'nexus:discover-cache:v1:';
export const DISCOVER_CACHE_TTL_MS = 15_000;
export const DISCOVER_REDIS_URL_ENV = 'NEXUS_REDIS_URL';

export type DiscoverCacheDriver = 'redis' | 'memory' | 'redis-unavailable';

export interface DiscoverCache {
  driver(): DiscoverCacheDriver;
  get(sort: DiscoverSort): Promise<DiscoverResult | undefined>;
  set(sort: DiscoverSort, value: DiscoverResult): Promise<void>;
  clear(): Promise<void>;
  liveSize(): Promise<number>;
}

const sortKey = (sort: DiscoverSort, prefix: string) => `${prefix}${sort}`;

/** 进程内（engine 单实例开发路径零依赖，等效之前的 discoverRouteCache 职责）。 */
class MemoryDiscoverCache implements DiscoverCache {
  private readonly store: TtlLru<string, DiscoverResult>;

  constructor(options?: TtlLruOptions) {
    this.store = new TtlLru<string, DiscoverResult>({ maxEntries: 8, defaultTtlMs: DISCOVER_CACHE_TTL_MS, ...options });
  }

  driver(): DiscoverCacheDriver {
    return 'memory';
  }

  async get(sort: DiscoverSort): Promise<DiscoverResult | undefined> {
    return this.store.get(sortKey(sort, ''));
  }

  async set(sort: DiscoverSort, value: DiscoverResult): Promise<void> {
    this.store.set(sortKey(sort, ''), value);
  }

  async clear(): Promise<void> {
    this.store.clear();
  }

  async liveSize(): Promise<number> {
    return this.store.liveSize();
  }
}

/**
 * Redis 驱动：SET … PX …，GET 走同步调用。每条命令 250ms 上限。
 * 报错只被 `driver()` 暴露；命令侧永不 reject——失败等于没缓存而已。
 */
class RedisDiscoverCache implements DiscoverCache {
  private readonly prefix: string;
  private readonly client: Redis;
  private lastError: string | null = null;
  private entriesEstimate = 0;
  private connected: Promise<boolean> | null = null;

  constructor(url: string, prefix: string = DEFAULT_KEY_PREFIX) {
    this.prefix = prefix;
    // 与 rate-limit 的 Redis 同一组参数：命令不排队，连不上立刻失败（不在这里断——Discover
    // 是只读的，路还能自己再算）。但连接要在第一次命令之前完成——`enableOfflineQueue: false`
    // 配合没连上的状态，命令会被当场拒绝，`read` 会永远得到 `undefined`，这正是集成测试抓到的。
    this.client = new Redis(url, {
      enableOfflineQueue: false,
      lazyConnect: true,
      commandTimeout: 250,
      connectTimeout: 10_000,
      maxRetriesPerRequest: 1,
    });
    this.client.on('error', (error: Error) => {
      // 只记不抛：连接自愈由 ioredis 自己负责。被 reporters 看到的是 driver() == 'redis-unavailable'。
      if (this.lastError === null) this.lastError = error.message;
    });
  }

  driver(): DiscoverCacheDriver {
    return this.lastError ? 'redis-unavailable' : 'redis';
  }

  private async ready(): Promise<boolean> {
    if (this.connected) return this.connected;
    this.connected = this.client.connect().then(() => true).catch(() => false);
    return this.connected;
  }

  async get(sort: DiscoverSort): Promise<DiscoverResult | undefined> {
    if (!(await this.ready())) return undefined;
    try {
      const value = await this.client.get(sortKey(sort, this.prefix));
      if (value === null) return undefined;
      return JSON.parse(value) as DiscoverResult;
    } catch {
      return undefined;
    }
  }

  async set(sort: DiscoverSort, value: DiscoverResult): Promise<void> {
    if (!(await this.ready())) return;
    try {
      await this.client.set(sortKey(sort, this.prefix), JSON.stringify(value), 'PX', DISCOVER_CACHE_TTL_MS);
      this.entriesEstimate += 1;
    } catch {
      /* 写入失败==没存, 读端自己重算 */
    }
  }

  async clear(): Promise<void> {
    if (!(await this.ready())) return;
    try {
      await this.client.del(sortKey('new', this.prefix), sortKey('popular', this.prefix), sortKey('following', this.prefix));
      this.entriesEstimate = 0;
    } catch {
      /* 忽略 */
    }
  }

  async liveSize(): Promise<number> {
    return this.entriesEstimate;
  }
}

let lazyDriver: DiscoverCache | null = null;

/** Lazily build the driver (reads NEXUS_REDIS_URL once). */
export function getDiscoverCache(): DiscoverCache {
  if (lazyDriver) return lazyDriver;
  const url = process.env[DISCOVER_REDIS_URL_ENV]?.trim();
  lazyDriver = url ? new RedisDiscoverCache(url) : new MemoryDiscoverCache();
  return lazyDriver;
}

/** Test-only seam: drop the cached singleton. */
export function __resetDiscoverCacheDriverForTests(): void {
  lazyDriver = null;
}

export { MemoryDiscoverCache, RedisDiscoverCache };
