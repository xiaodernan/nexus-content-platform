/**
 * 世界文档读路径共享缓存（v710 / ADR 0143）—— /world/*、Studio 面板、知识同步
 * 每次都要 loadWorld：一次 SQL + zod + validateWorld。世界文档是文字为主的小文档，
 * 写频率极低（一次 PUT 才换），读频率远高于写；30 秒窗口把重复的读压成一次。
 *
 * ## 契约（与 /api/discover 的缓存同一口径，不造新概念）
 * - 命中就不再问库——缓存的是**校验过后**的 `WorldResult`（含缺失世界这种「没世界」答案）；
 *   zod/validateWorld 只在缓存落档或失效后跑一次；
 * - TTL 30s（PX）。跨实例一致性由共享 Redis 键兜底；单机无 Redis 时退化为进程内 TtlLru
 *   （与 discover 的「NEXUS_REDIS_URL 设了 → Redis，否则内存」同一个旋钮、同一形状）；
 * - 写路径（saveWorld 两个落点）在写成功后立即 DEL 键——旧文档没有复活窗口；
 *   fixture/直连 SQL 的写不走这条路，30s TTL 是它们的上界，写在注释里不装作没有；
 * - Redis 连不上：get 端返回 undefined（读端自己重算），set 端静默放弃——不退回内存、
 *   不静默降级成错答；driver() 如实报 'redis-unavailable'。错误保持第一现场，不缓存。
 * - 键 `nexus:world-view:v1:<projectId>`；契约破坏性变更 = 改前缀、自动换代。
 * - 不缓存与用户有关的任何东西：键里没有 viewerId/角色；可见性判定在调用方
 *   （projectVisibleTo）之前完成，缓存的是「这份世界长什么样」，不是「你能不能看」。
 * - 不带 single-flight/generation 守卫（discover 那份是为全站最热 anon 路径造的）：
 *   loadWorld 读路径空窗期最多多算一次，工程复杂度不划算；写后 DEL 已封住正确性。
 */
import { Redis } from 'ioredis';
import { TtlLru, type TtlLruOptions } from './ttlLru';
import type { WorldResult } from '@/server/domain/worlds';

/** 缓存的值：校验过的 WorldResult；null = 「这份世界不存在」（同样是答案，同样 30s 过期）。 */
export type CachedWorldValue = WorldResult | null;
/** undefined = 未命中或驱动故障（读端自己重算），不是「没世界」。 */
export type WorldViewCacheGet = CachedWorldValue | undefined;

export const DEFAULT_KEY_PREFIX = 'nexus:world-view:v1:';
export const WORLD_VIEW_CACHE_TTL_MS = 30_000;
export const WORLD_VIEW_REDIS_URL_ENV = 'NEXUS_REDIS_URL';

export type WorldViewCacheDriver = 'redis' | 'memory' | 'redis-unavailable';

export interface WorldViewCache {
  driver(): WorldViewCacheDriver;
  get(projectId: string): Promise<WorldViewCacheGet>;
  set(projectId: string, value: CachedWorldValue): Promise<void>;
  del(projectId: string): Promise<void>;
  liveSize(): Promise<number>;
}

const key = (projectId: string, prefix: string) => `${prefix}${projectId}`;

/** 进程内驱动（单实例开发/测试零依赖；60 条上界 + 30s TTL 双保险）。 */
class MemoryWorldViewCache implements WorldViewCache {
  private readonly store: TtlLru<string, CachedWorldValue>;

  constructor(options?: TtlLruOptions) {
    this.store = new TtlLru<string, CachedWorldValue>({ maxEntries: 64, defaultTtlMs: WORLD_VIEW_CACHE_TTL_MS, ...options });
  }

  driver(): WorldViewCacheDriver {
    return 'memory';
  }

  async get(projectId: string): Promise<WorldViewCacheGet> {
    return this.store.get(key(projectId, ''));
  }

  async set(projectId: string, value: CachedWorldValue): Promise<void> {
    this.store.set(key(projectId, ''), value);
  }

  async del(projectId: string): Promise<void> {
    this.store.delete(key(projectId, ''));
  }

  async liveSize(): Promise<number> {
    return this.store.liveSize();
  }
}

/**
 * Redis 驱动。每条命令 250ms 上限，命令侧永不 reject——失败等于没缓存而已。
 * 进程之间没有本地副本（每次 get 都问共享键），DEL 即刻全实例生效。
 */
class RedisWorldViewCache implements WorldViewCache {
  private readonly prefix: string;
  private readonly client: Redis;
  private lastError: string | null = null;
  private entriesEstimate = 0;
  private connected: Promise<boolean> | null = null;

  constructor(url: string, prefix: string = DEFAULT_KEY_PREFIX) {
    this.prefix = prefix;
    this.client = new Redis(url, {
      enableOfflineQueue: false,
      lazyConnect: true,
      commandTimeout: 250,
      connectTimeout: 10_000,
      maxRetriesPerRequest: 1,
    });
    this.client.on('error', (error: Error) => {
      if (this.lastError === null) this.lastError = error.message;
    });
  }

  driver(): WorldViewCacheDriver {
    return this.lastError ? 'redis-unavailable' : 'redis';
  }

  private async ready(): Promise<boolean> {
    if (this.connected) return this.connected;
    this.connected = this.client.connect().then(() => true).catch(() => false);
    return this.connected;
  }

  async get(projectId: string): Promise<WorldViewCacheGet> {
    if (!(await this.ready())) return undefined;
    try {
      const raw = await this.client.get(key(projectId, this.prefix));
      if (raw === null) return undefined;
      return JSON.parse(raw) as CachedWorldValue;
    } catch {
      return undefined;
    }
  }

  async set(projectId: string, value: CachedWorldValue): Promise<void> {
    if (!(await this.ready())) return;
    try {
      await this.client.set(key(projectId, this.prefix), JSON.stringify(value), 'PX', WORLD_VIEW_CACHE_TTL_MS);
      this.entriesEstimate += 1;
    } catch {
      /* 写入失败 == 没存，读端自己重算 */
    }
  }

  async del(projectId: string): Promise<void> {
    if (!(await this.ready())) return;
    try {
      await this.client.del(key(projectId, this.prefix));
    } catch {
      /* 删不掉也最多 30s，TTL 是回廊 */
    }
  }

  async liveSize(): Promise<number> {
    return this.entriesEstimate;
  }
}

let lazyDriver: WorldViewCache | null = null;

/** Lazily build the driver (reads NEXUS_REDIS_URL once). */
export function getWorldViewCache(): WorldViewCache {
  if (lazyDriver) return lazyDriver;
  const url = process.env[WORLD_VIEW_REDIS_URL_ENV]?.trim();
  lazyDriver = url ? new RedisWorldViewCache(url) : new MemoryWorldViewCache();
  return lazyDriver;
}

/** Write path helper: fire-and-forget DEL after a successful world save. */
export async function invalidateWorldViewCache(projectId: string): Promise<void> {
  await getWorldViewCache().del(projectId);
}

/** Test-only seam: drop the cached singleton. */
export function __resetWorldViewCacheForTests(): void {
  lazyDriver = null;
}

export { MemoryWorldViewCache, RedisWorldViewCache };
