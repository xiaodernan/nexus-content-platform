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
import { createRedisInvalidationBus, type InvalidationBus, type InvalidationBusStats } from './invalidation-bus';
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
  /** 跨实例失效总线的读数（没接 = null）；最终一致、会丢帧，不是隐私强一致承诺 */
  readonly bus: InvalidationBusStats | null;
};

interface Store {
  readonly cache: BoundedCache<DiscoverResult>;
  /** viewerId -> 当前生效的 generation；有界 LRU，条目被淘汰只会多查库，不会串味 */
  readonly viewerGen: Map<string, number>;
  /** 只增不减的单调水位线，永不随淘汰/重置归零 */
  globalGen: number;
  readonly config: DiscoverCacheConfig;
  /** 可选跨实例失效总线；不设 NEXUS_REDIS_URL 或注入替身时为 null（单机语义零变化） */
  bus: InvalidationBus | null;
  /** 订阅退订函数；reset/热重载时解绑，避免旧 store 的回调还 bump 新 store */
  unsubscribe: (() => void) | null;
  /** 建总线过程中的线路错误数（连接失败、坏帧等），只记账不影响本机正确性 */
  busErrors: number;
}

export const DISCOVER_TTL_MS_ENV = 'NEXUS_DISCOVER_CACHE_TTL_MS';
export const DISCOVER_MAX_ENTRIES_ENV = 'NEXUS_DISCOVER_CACHE_MAX_ENTRIES';
export const DISCOVER_MAX_VIEWERS_ENV = 'NEXUS_DISCOVER_CACHE_MAX_VIEWERS';
/** 跨实例失效总线的开关：与实时总线、限流、网关共享缓存共用这一个 Redis 旋钮（ADR-0081/0112）。 */
export const DISCOVER_INVALIDATION_URL_ENV = 'NEXUS_REDIS_URL';

const DEFAULT_TTL_MS = 15_000;
const DEFAULT_MAX_ENTRIES = 2048;
const DEFAULT_MAX_VIEWERS = 512;

/** 判据注入时钟/容量/失效总线替身用；生产调用不传，全部走默认 + 环境。 */
export interface DiscoverCacheTestOverrides {
  readonly ttlMs?: number;
  readonly maxEntries?: number;
  readonly maxViewers?: number;
  readonly now?: () => number;
  readonly clock?: () => string;
  /**
   * 注入失效总线替身（内存 bus，判据用）。显式传 `null` = 强制单机、不读 env 建 Redis bus；
   * 不传 = 走 `NEXUS_REDIS_URL` 的 opt-in 默认。
   */
  readonly bus?: InvalidationBus | null;
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

/**
 * 本地 bump：淘汰这些 viewer 的 generation 条目，让它们的旧键即时失效。
 * 本地写路径与远端订阅帧**共用这一句**，避免两处逻辑漂移；返回实际淘汰的条数。
 * 注意只删 generation、不删缓存条目——旧键带旧 generation，水位线保证它永不被拼出，
 * 缓存旧值交 TTL/LRU 回收（O(viewer 数)、无前缀扫描、匿名 no-op）。
 */
function bumpLocal(s: Store, viewerIds: (string | null | undefined)[]): number {
  let removed = 0;
  for (const id of viewerIds) {
    if (id && s.viewerGen.delete(id)) removed += 1;
  }
  return removed;
}

/** 收摊：解绑订阅 + dispose 自有 bus（重复 reset / 热重载时防连接泄漏与 vitest 退出 hang）。 */
function closeStore(s: Store): void {
  try {
    s.unsubscribe?.();
  } catch {
    /* 退订不该抛；真抛了也要继续 dispose，不能把一条坏回调变成连接泄漏 */
  }
  s.bus?.dispose();
}

/**
 * 给 store 挂一条失效总线，并订阅「远端帧 → bumpLocal」。
 * - 显式注入（`overrides.bus` 非 undefined）：同步挂载，判据用，全程不读 env、不连真 Redis。
 * - 生产默认：仅在设了 `NEXUS_REDIS_URL` 时惰性异步建 Redis bus；连不上/建失败 fail-open 当单机。
 *
 * 异步落定有**脏写防护**：只有 store 仍是全局当前实例时才挂载，否则 dispose 掉新建的 bus
 * （热重载/测试 reset 期间旧异步不能把一条连接挂到已废弃的 store 上）。
 */
function attachBus(s: Store, injected: InvalidationBus | null | undefined): void {
  const mount = (bus: InvalidationBus): void => {
    // 只有当前 store 还没挂 bus、且仍是全局实例时才接纳，杜绝重复挂载/脏写。
    if (store[STORE_KEY] !== s || s.bus) {
      bus.dispose();
      return;
    }
    s.bus = bus;
    s.unsubscribe = bus.subscribe((ids) => {
      bumpLocal(s, ids); // 远端失效与本地共用 bumpLocal
    });
  };

  if (injected !== undefined) {
    if (injected) mount(injected); // 显式 null = 强制单机
    return;
  }
  const url = process.env[DISCOVER_INVALIDATION_URL_ENV]?.trim();
  if (!url) return; // 没设 Redis 旋钮：单机默认，零网络、零变化
  void createRedisInvalidationBus({
    url,
    onError: () => {
      s.busErrors += 1; // 只记账：线路问题不影响本机正确性（本地失效照旧先执行）
    },
  })
    .then(mount)
    .catch(() => {
      s.busErrors += 1; // 动态 import 失败 / 构造异常都 fail-open 回单机
    });
}

/** 重建 store（首次惰性初始化 / 判据清场）。globalGen 跨重建保留，杜绝水位线回退串味。 */
export function resetDiscoverCacheForTest(overrides: DiscoverCacheTestOverrides = {}): void {
  const previous = store[STORE_KEY] as Store | undefined;
  if (previous) closeStore(previous);
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
  const next: Store = {
    cache,
    viewerGen: new Map<string, number>(),
    globalGen: previous?.globalGen ?? 0,
    config,
    bus: null,
    unsubscribe: null,
    busErrors: 0,
  };
  store[STORE_KEY] = next; // 先落位再挂 bus，让 attachBus 的"是否当前实例"判断成立
  attachBus(next, overrides.bus);
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
 * 失效的参数化内核（全局入口与多实例测试工厂共用这一句，杜绝两处逻辑漂移）。
 * 顺序是关键：**本地 bump 永远先执行**（本机隐私即时生效，不依赖网络），随后才 fire-and-forget
 * 广播；广播失败也不回退、不抛、不阻塞正在写库的那条请求（SC-41 的语义一字不改）。
 * 跨实例是尽力即时的最终一致：对方断线丢帧时最坏多用一个 TTL 的旧 generation，随后自愈。
 */
function invalidateInStore(s: Store, viewerIds: (string | null | undefined)[]): void {
  bumpLocal(s, viewerIds); // 1. 本机即时失效（永远先做，fail-open 的最后一道）
  const ids = viewerIds.filter((id): id is string => Boolean(id));
  if (ids.length) s.bus?.publish(ids); // 2. 净辐射广播（同步 void、绝不抛、绝不 await 网络）
}

/** 写路径调用：让这些 viewer 的所有旧键**即时**失效，并把这一帧广播给别的实例。匿名 `null` 是 no-op。 */
export function invalidateDiscoverFor(...viewerIds: (string | null | undefined)[]): void {
  invalidateInStore(getStore(), viewerIds);
}

/** 取或加载的参数化内核（全局入口与多实例测试工厂共用）。同 viewer/sort/limit 并发只跑一次 loader。 */
async function loadFromStore(s: Store, input: DiscoverCacheInput, loader: DiscoverLoader): Promise<DiscoverResult> {
  return (await s.cache.getOrLoad(keyFor(s, input), loader)).value;
}

/**
 * 取或加载一份发现页结果。loader 由 `social.discoverCached` 注入（此处不 import social 运行时值，
 * 依赖单向无环）。同 viewer/sort/limit 并发只跑一次 loader；不同 viewer 永不合并。
 */
export async function loadDiscoverCached(input: DiscoverCacheInput, loader: DiscoverLoader): Promise<DiscoverResult> {
  return loadFromStore(getStore(), input, loader);
}

export function discoverCacheStats(): DiscoverCacheStats {
  const s = getStore();
  return {
    ...s.cache.stats(),
    globalGen: s.globalGen,
    viewerGenerations: s.viewerGen.size,
    config: s.config,
    bus: s.bus ? { ...s.bus.stats(), errors: s.bus.stats().errors + s.busErrors } : null,
  };
}

/** 判据用：只读当前生成的键（会分配/刷新 generation，故调用即"此 viewer 此刻的键"）。 */
export function discoverCacheKeyForTest(input: DiscoverCacheInput): string {
  return keyFor(getStore(), input);
}

/**
 * 判据用：造一个**与全局同构但独立**的 store，用于同进程测"两个实例经 bus 互通"（模拟多进程部署）。
 * 关键：它复用 `loadFromStore`/`invalidateInStore`/`keyFor`/`bumpLocal` 同一套内核，不复制任何逻辑——
 * 否则测的就不是生产那条路径了。挂 bus 时把远端帧接到本实例的 `bumpLocal`，与全局 store 的
 * `attachBus` 语义一致。
 */
export interface IsolatedDiscoverCache {
  load(input: DiscoverCacheInput, loader: DiscoverLoader): Promise<DiscoverResult>;
  invalidate(...viewerIds: (string | null | undefined)[]): void;
  stats(): DiscoverCacheStats;
  keyFor(input: DiscoverCacheInput): string;
  dispose(): void;
}

export function createIsolatedDiscoverCacheForTest(options: {
  bus?: InvalidationBus | null;
  now?: () => number;
  ttlMs?: number;
  maxViewers?: number;
  maxEntries?: number;
}): IsolatedDiscoverCache {
  const config: DiscoverCacheConfig = {
    ttlMs: options.ttlMs ?? DEFAULT_TTL_MS,
    maxEntries: options.maxEntries ?? DEFAULT_MAX_ENTRIES,
    maxViewers: options.maxViewers ?? DEFAULT_MAX_VIEWERS,
  };
  const cache = new BoundedCache<DiscoverResult>({
    maxEntries: config.maxEntries,
    ttlMs: config.ttlMs,
    now: options.now,
  });
  const s: Store = {
    cache,
    viewerGen: new Map<string, number>(),
    globalGen: 0,
    config,
    bus: options.bus ?? null,
    unsubscribe: null,
    busErrors: 0,
  };
  // 与全局 store 的 attachBus 同一语义：远端帧 → 本实例 bumpLocal（本地与远端共用内核）。
  if (s.bus) s.unsubscribe = s.bus.subscribe((ids) => bumpLocal(s, ids));
  return {
    load: (input, loader) => loadFromStore(s, input, loader),
    invalidate: (...ids) => invalidateInStore(s, ids),
    stats: () => ({
      ...s.cache.stats(),
      globalGen: s.globalGen,
      viewerGenerations: s.viewerGen.size,
      config: s.config,
      bus: s.bus ? { ...s.bus.stats(), errors: s.bus.stats().errors + s.busErrors } : null,
    }),
    keyFor: (input) => keyFor(s, input),
    dispose: () => {
      s.unsubscribe?.();
      // 注意：不 dispose bus——测试里多个实例共享同一条/各自持有的 bus，由测试统一收摊。
    },
  };
}
