/**
 * 发现页热读的「按 viewer 分键」有界缓存（§SC-41 / ADR-0113）。
 *
 * 它要挡的不是"慢"，而是三种会真发生的错：
 *
 * 1. **跨 viewer 串味（隐私红线）**：`discover` 的结果随 viewer 的屏蔽名单与关注关系而变
 *    （`hiddenAuthorIds` / `following`）。若缓存键不含 viewer、或 singleflight 跨 viewer 合并，
 *    我拉黑的人会经由别人先热起来的那份缓存漏回我眼前。故键 = generation + 编码后的
 *    `(viewerId, sort, limit)`，singleflight 按完整键合并——不同 viewer 永不共用一次加载。
 * 2. **写后不失效（同样是隐私红线）**：block / mute / follow 一改，该 viewer 的所有旧键必须
 *    **即时**作废，不能等 TTL（TTL 内仍看得到被拉黑的人 = 拉黑没生效）。故写路径调
 *    `invalidateDiscoverFor`，它把该 viewer 的 generation 淘汰掉。
 * 3. **generation 淘汰后回退 → 旧隐私缓存复活（最隐蔽，也是最容易被漏掉的一条）**：
 *    generation 若按「每 viewer 一个从 0 起的小计数器 + LRU 淘汰」实现，某 viewer 被淘汰后
 *    再来会重新拿到 0，于是命中它**拉黑前**缓存的那份 key。根治是**进程级单调递增水位线
 *    `globalGen`**：任何 viewer 重新分配到的 generation 都严格大于它历史上用过的所有值，
 *    旧键永久拼不出来，最坏只是多查一次库。
 *
 * 另两层与 §SC-40 网关缓存复用同一个 `BoundedCache` 原语：
 * - **有界 TTL + LRU**：键由 viewer × sort 撑，注册用户/爬虫不能决定本进程留多少内存；
 *   TTL 只负责"公有内容（新发布/计数/榜单）别太陈旧"，隐私新鲜度靠上面的主动失效兜。
 * - **singleflight**：同一 viewer 并发热读只打一次库；同一时刻的 N 个 RSC 导航不放大成 N 条 SQL。
 *
 * 单例挂 `globalThis`（与 `gateway/index.ts` 同范式）：Next 开发态热重载、RSC 与 route handler
 * 共享同一份缓存与水位线；否则每次重建缓存 = 缓存形同虚设，且水位线回退到 0 会串味。
 *
 * 依赖方向刻意做成**单向无环**：本模块只 `import type` social 的类型（编译期擦除），
 * 从不引用 social 的运行时值；真正的加载器由 `social.discoverCached` 以闭包注入。
 */
import { BoundedCache, type CacheStats } from '../gateway/cache';
import type { DiscoverResult, DiscoverSort } from './social';

export interface DiscoverCacheInput {
  readonly sort: DiscoverSort;
  readonly viewerId?: string | null;
  readonly limit?: number;
}

export type DiscoverLoader = () => Promise<DiscoverResult>;

export interface DiscoverCacheConfig {
  readonly ttlMs: number;
  readonly maxEntries: number;
  readonly maxViewers: number;
}

export type DiscoverCacheStats = CacheStats & {
  /** 进程级单调水位线，只增不减；判据用它证明淘汰后不会回退 */
  readonly globalGen: number;
  /** 当前留在 generation 表里的 viewer 数（有界） */
  readonly viewerGenerations: number;
  readonly config: DiscoverCacheConfig;
};

interface Store {
  readonly cache: BoundedCache<DiscoverResult>;
  /** viewerId -> 当前生效的 generation；有界 LRU，条目被淘汰只会多查库，不会串味 */
  readonly viewerGen: Map<string, number>;
  /** 只增不减的单调水位线，永不随淘汰/重置归零 */
  globalGen: number;
  readonly config: DiscoverCacheConfig;
}

export const DISCOVER_TTL_MS_ENV = 'NEXUS_DISCOVER_CACHE_TTL_MS';
export const DISCOVER_MAX_ENTRIES_ENV = 'NEXUS_DISCOVER_CACHE_MAX_ENTRIES';
export const DISCOVER_MAX_VIEWERS_ENV = 'NEXUS_DISCOVER_CACHE_MAX_VIEWERS';

const DEFAULT_TTL_MS = 15_000;
const DEFAULT_MAX_ENTRIES = 2048;
const DEFAULT_MAX_VIEWERS = 512;

/** 判据注入时钟/容量覆盖用；生产调用不传，全部走默认 + 环境。 */
export interface DiscoverCacheTestOverrides {
  readonly ttlMs?: number;
  readonly maxEntries?: number;
  readonly maxViewers?: number;
  readonly now?: () => number;
  readonly clock?: () => string;
}

interface GlobalStore {
  [key: string]: unknown;
}

const STORE_KEY = '__nexus_discover_cache_v1__';
const store = globalThis as GlobalStore;

function envInt(name: string, fallback: number, min: number): number {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed >= min ? parsed : fallback;
}

/** 重建 store（首次惰性初始化 / 判据清场）。globalGen 跨重建保留，杜绝水位线回退串味。 */
export function resetDiscoverCacheForTest(overrides: DiscoverCacheTestOverrides = {}): void {
  const previous = store[STORE_KEY] as Store | undefined;
  const config: DiscoverCacheConfig = {
    ttlMs: overrides.ttlMs ?? envInt(DISCOVER_TTL_MS_ENV, DEFAULT_TTL_MS, 1),
    maxEntries: overrides.maxEntries ?? envInt(DISCOVER_MAX_ENTRIES_ENV, DEFAULT_MAX_ENTRIES, 1),
    maxViewers: overrides.maxViewers ?? envInt(DISCOVER_MAX_VIEWERS_ENV, DEFAULT_MAX_VIEWERS, 1),
  };
  const cache = new BoundedCache<DiscoverResult>({
    maxEntries: config.maxEntries,
    ttlMs: config.ttlMs,
    now: overrides.now,
    clock: overrides.clock,
  });
  store[STORE_KEY] = {
    cache,
    viewerGen: new Map<string, number>(),
    globalGen: previous?.globalGen ?? 0,
    config,
  } satisfies Store;
}

function getStore(): Store {
  if (!store[STORE_KEY]) resetDiscoverCacheForTest();
  return store[STORE_KEY] as Store;
}

/**
 * 取 viewer 当前生效的 generation。
 * - 匿名（`null`）恒 0：匿名没有屏蔽/关注，视图完全公有，一份共享、永不按 viewer 失效（靠 TTL 兜新鲜度）。
 * - 登录 viewer：命中条目则顺手刷新 LRU 顺序；未命中（首次或被淘汰）则分配 `++globalGen`。
 *   关键：被淘汰后再分配到的值**严格大于**它历史用过的任何值，旧 key 永久拼不出来。
 */
function generationFor(s: Store, viewerId: string | null): number {
  if (viewerId === null) return 0;
  const current = s.viewerGen.get(viewerId);
  if (current !== undefined) {
    s.viewerGen.delete(viewerId);
    s.viewerGen.set(viewerId, current);
    return current;
  }
  const fresh = (s.globalGen += 1);
  s.viewerGen.set(viewerId, fresh);
  while (s.viewerGen.size > s.config.maxViewers) {
    const oldest = s.viewerGen.keys().next().value as string | undefined;
    if (oldest === undefined) break;
    s.viewerGen.delete(oldest);
  }
  return fresh;
}

/** JSON 数组编码，viewerId 含 `|`/`:` 也不会与别的 (viewer,sort,limit) 组合碰撞。limit 缺省按 discover 的 24。 */
function keyFor(s: Store, input: DiscoverCacheInput): string {
  const viewerId = input.viewerId ?? null;
  const generation = generationFor(s, viewerId);
  return `discover:v1|${generation}|${JSON.stringify([viewerId, input.sort, input.limit ?? 24])}`;
}

/**
 * 写路径调用：让这些 viewer 的所有旧键**即时**失效。
 * 只淘汰 generation 条目、不删缓存条目——旧键带旧 generation，水位线保证它永不被再次拼出，
 * 缓存里的旧值交给 TTL/LRU 回收即可（失效是 O(viewer 数) 而非 O(键数)，且无前缀扫描）。
 * 匿名传 `null` 是 no-op（没有私有视图可失效）。
 */
export function invalidateDiscoverFor(...viewerIds: (string | null | undefined)[]): void {
  const s = getStore();
  for (const id of viewerIds) if (id) s.viewerGen.delete(id);
}

/**
 * 取或加载一份发现页结果。loader 由 `social.discoverCached` 注入（此处不 import social 运行时值，
 * 依赖单向无环）。同 viewer/sort/limit 并发只跑一次 loader；不同 viewer 永不合并。
 */
export async function loadDiscoverCached(input: DiscoverCacheInput, loader: DiscoverLoader): Promise<DiscoverResult> {
  const s = getStore();
  const key = keyFor(s, input);
  return (await s.cache.getOrLoad(key, loader)).value;
}

export function discoverCacheStats(): DiscoverCacheStats {
  const s = getStore();
  return {
    ...s.cache.stats(),
    globalGen: s.globalGen,
    viewerGenerations: s.viewerGen.size,
    config: s.config,
  };
}

/** 判据用：只读当前生成的键（会分配/刷新 generation，故调用即"此 viewer 此刻的键"）。 */
export function discoverCacheKeyForTest(input: DiscoverCacheInput): string {
  return keyFor(getStore(), input);
}
