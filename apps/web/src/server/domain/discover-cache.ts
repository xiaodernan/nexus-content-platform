/**
 * 发现页热读的「按 viewer 分键」有界缓存（§SC-41 / ADR-0113）。
 *
 * 它要挡的不是"慢"，而是四种会真发生的错：
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
 * 4. **新作品发布后最多一个 TTL 才进发现页（§SC-44 / ADR-0116，内容新鲜度）**：public 发布 /
 *    从 public 下架 / public 内容被 rejected，对所有 viewer 都是新内容，连匿名共享缓存也得分。
 *    故键再带一段**全缓存世代 `globalEpoch`**：这些写路径调 `invalidateDiscoverGlobally` 让它 +1，
 *    所有旧键（匿名 `|0|…`、已缓存 viewer 的旧 generation）一次性拼不出来。**与 `globalGen` 正交**：
 *    内容变更不动 privacy 分键、privacy 变更不动全局世代；两者都**跨 reset 保留**防旧键复活。
 *    不能靠 `++globalGen`/清 `viewerGen` 代替——匿名恒 0、已缓存 viewer 读缓存值，都绕过它们。
 *
 * 另两层与 §SC-40 网关缓存复用同一个 `BoundedCache` 原语：
 * - **有界 TTL + LRU**：键由 viewer × sort 撑，注册用户/爬虫不能决定本进程留多少内存；
 *   TTL 是**最终兜底**（计数/榜单等没有写路径信号的公有数据靠它收敛），隐私与发现页收录
 *   的新鲜度都靠上面的主动失效兜——不把"新作品多久出现"押在 TTL 到点上。
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
  /** §SC-45 失效波采样窗口（毫秒）：全局失效后这么久内的重填算这一波。默认一个 TTL。 */
  readonly waveWindowMs: number;
  /** §SC-45 失效波环形缓冲容量：只留最近 N 波，防读数无界增长。默认 12。 */
  readonly waveCapacity: number;
  /**
   * §SC-46 上游失败时允许端出的旧值最大年龄（毫秒）。默认 `ttlMs * 2`：
   * 正常缓存命中本就可能是 ttlMs 内的旧值，降级再多给一个 TTL 的宽容；超过就宁可报错。
   * `peek()` 拿到的 expired 条目 ageMs **无上界**（键长期没人读会滞留到 LRU 淘汰），
   * 故必须由这道闸卡住，绝不把几小时前的发现页冒充"还能看"。
   */
  readonly staleMaxMs: number;
}

/**
 * §SC-45 一次"全局失效波"的读数：从 `globalEpoch` 跳变那一刻起到采样窗口结束，
 * 这段时间内真打库的次数 / 在途并发峰值 / 首击延迟。把 SC-44 诚实留下的"预期冷启动尖峰"
 * 从猜测变成可观测、可设阈值的数字——**只记不拦**，零新 DB 查询、零生产行为变化。
 *
 * 采样而非 profiler：`loadsDelta` 用 `cache.stats().loads` 的差值（BoundedCache 的 loads 只在真发起
 * loader 时 +1），精确锚定"这一波真打了几库"；`peakInFlight` 是每次读之后的瞬时采样最大值，
 * 不是锁存精确峰值（诚实写进 ADR）。窗口内没人读的波 `loadsDelta=0`——那正是"没有惊群"的证据。
 */
export interface EpochWave {
  /** 触发这次波的全局世代值（失效后的新 epoch） */
  readonly epoch: number;
  /** 波开启时刻（注入时钟的毫秒值） */
  readonly openedAtMs: number;
  /** 采样窗口内真发起的 loader 次数（= 打库次数） */
  readonly loadsDelta: number;
  /** 采样到的在途 loader 峰值（瞬时采样，非锁存） */
  readonly peakInFlight: number;
  /** 从失效到第一次真打库的毫秒数；窗口内无人读为 null（不是 0——0 会谎称"瞬间就有人读"） */
  readonly firstFillMs: number | null;
  /** 是否已定格（false = 仍在采样窗口内、读数还在变） */
  readonly settled: boolean;
}

export type DiscoverCacheStats = CacheStats & {
  /** 进程级单调水位线，只增不减；判据用它证明淘汰后不会回退 */
  readonly globalGen: number;
  /** §SC-44 全缓存世代版本号，只增不减；每次全局失效 +1，面板据此看"发布清了几次缓存" */
  readonly globalEpoch: number;
  /** 当前留在 generation 表里的 viewer 数（有界） */
  readonly viewerGenerations: number;
  readonly config: DiscoverCacheConfig;
  /** 跨实例失效总线的读数（没接 = null）；最终一致、会丢帧，不是隐私强一致承诺 */
  readonly bus: InvalidationBusStats | null;
  /** §SC-45 最近若干次全局失效波（有界环形缓冲，新的在前）；空数组 = 还没发生过全局失效 */
  readonly waves: readonly EpochWave[];
  /** §SC-45 采样窗口配置（毫秒 / 缓冲条数），让面板讲清"这是采样不是 profiler" */
  readonly waveConfig: { readonly windowMs: number; readonly capacity: number };
  /**
   * §SC-46 本实例迄今端出过几次"上游失败降级"的旧值（进程内累计，只增不减）。
   * 0 = 从没降级过，**不是**"降级功能没开"——后者看 config.staleMaxMs。降级对内容消费者透明，
   * 但运维必须看得见"DB 在抖、这台端了几次旧页"，否则失败被悄悄吞掉。
   */
  readonly staleServed: number;
};

interface Store {
  readonly cache: BoundedCache<DiscoverResult>;
  /** viewerId -> 当前生效的 generation；有界 LRU，条目被淘汰只会多查库，不会串味 */
  readonly viewerGen: Map<string, number>;
  /** 只增不减的单调水位线，永不随淘汰/重置归零（给**新 viewer** 分配 generation 用） */
  globalGen: number;
  /**
   * §SC-44 全缓存世代版本号（与 `globalGen` 正交，绝不复用）。新作品发布/下架/审核拒绝
   * 对所有 viewer 都是新内容，需要让**所有键**（含匿名的 `|0|…`、已缓存 viewer 的旧 generation）
   * 一次性拼不出来。为什么不能靠 `++globalGen`：匿名 generation 恒 0、已缓存 viewer 直接读缓存值，
   * 两者都绕过 `globalGen`，bump 它一个现有键都失效不了。故独立一个键段、每次全局失效 `+1`。
   * 同样**跨 reset/热重载保留**，否则 epoch 回退会复活旧键（与 `globalGen` 同一条理由）。
   */
  globalEpoch: number;
  readonly config: DiscoverCacheConfig;
  /** 可选跨实例失效总线；不设 NEXUS_REDIS_URL 或注入替身时为 null（单机语义零变化） */
  bus: InvalidationBus | null;
  /** 订阅退订函数；reset/热重载时解绑，避免旧 store 的回调还 bump 新 store */
  unsubscribe: (() => void) | null;
  /** 建总线过程中的线路错误数（连接失败、坏帧等），只记账不影响本机正确性 */
  busErrors: number;
  /** 与 BoundedCache 同一个时钟源，供失效波记时间戳；判据注入受控时钟即可钉延迟 */
  readonly now: () => number;
  /** §SC-45 当前仍在采样窗口内的全局失效波；null = 还没发生过全局失效 */
  activeWave: MutableWave | null;
  /** §SC-45 已定格的失效波，旧的在前（环形缓冲语义由 pushWave 维护容量与顺序） */
  settledWaves: EpochWave[];
  /** §SC-46 本实例迄今端出过几次上游失败降级的旧值（只增不减，进程内账，不跨 reset） */
  staleServed: number;
}

/** §SC-45 采样窗口：全局失效后这么久内的重填算作"这一波"。默认一个 TTL——过了它旧键本就自然过期。 */
const DEFAULT_WAVE_WINDOW_MS = 15_000;
/** §SC-45 环形缓冲容量：只留最近 12 波，防发布高频时读数无界增长（数据结构有界纪律）。 */
const DEFAULT_WAVE_CAPACITY = 12;

/** 采样中的可变波；定格时转不可变 EpochWave 存入环形缓冲。 */
interface MutableWave {
  readonly epoch: number;
  readonly openedAtMs: number;
  readonly loadsAtOpen: number;
  loadsDelta: number;
  peakInFlight: number;
  firstFillMs: number | null;
}

export const DISCOVER_TTL_MS_ENV = 'NEXUS_DISCOVER_CACHE_TTL_MS';
export const DISCOVER_MAX_ENTRIES_ENV = 'NEXUS_DISCOVER_CACHE_MAX_ENTRIES';
export const DISCOVER_MAX_VIEWERS_ENV = 'NEXUS_DISCOVER_CACHE_MAX_VIEWERS';
/** §SC-45 失效波采样窗口（毫秒）；默认一个 TTL。 */
export const DISCOVER_WAVE_WINDOW_MS_ENV = 'NEXUS_DISCOVER_WAVE_WINDOW_MS';
/** §SC-45 失效波环形缓冲容量；默认 12。 */
export const DISCOVER_WAVE_CAPACITY_ENV = 'NEXUS_DISCOVER_WAVE_CAPACITY';
/** §SC-46 上游失败降级时旧值的最大年龄；默认 `ttlMs * 2`。 */
export const DISCOVER_STALE_MAX_MS_ENV = 'NEXUS_DISCOVER_STALE_MAX_MS';
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
  /** §SC-45 失效波采样窗口 / 容量（判据收窄窗口以消除等待，不 sleep）。 */
  readonly waveWindowMs?: number;
  readonly waveCapacity?: number;
  /** §SC-46 上游失败降级的旧值最大年龄（判据收窄以验"超界宁可报错"，不 sleep）。 */
  readonly staleMaxMs?: number;
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
    s.unsubscribe = bus.subscribe((ids, global) => {
      // 远端帧与本地写路径共用同一内核：定向帧只 bump 这些人，全局帧 bump 整个世代。
      // §SC-45 远端实例收到全局帧同样经历冷启动，必须开自己的波，否则多实例下只有发布那台尖峰可见。
      if (global === true) bumpEpochAndOpenWave(s, s.now());
      else bumpLocal(s, ids);
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
  const ttlMs = overrides.ttlMs ?? envInt(DISCOVER_TTL_MS_ENV, DEFAULT_TTL_MS, 1);
  const config: DiscoverCacheConfig = {
    ttlMs,
    maxEntries: overrides.maxEntries ?? envInt(DISCOVER_MAX_ENTRIES_ENV, DEFAULT_MAX_ENTRIES, 1),
    maxViewers: overrides.maxViewers ?? envInt(DISCOVER_MAX_VIEWERS_ENV, DEFAULT_MAX_VIEWERS, 1),
    waveWindowMs: overrides.waveWindowMs ?? envInt(DISCOVER_WAVE_WINDOW_MS_ENV, DEFAULT_WAVE_WINDOW_MS, 1),
    waveCapacity: overrides.waveCapacity ?? envInt(DISCOVER_WAVE_CAPACITY_ENV, DEFAULT_WAVE_CAPACITY, 1),
    // 默认一个 TTL 的降级宽容（与正常缓存命中的新鲜度同量级）；env/overrides 可覆盖。
    staleMaxMs: overrides.staleMaxMs ?? envInt(DISCOVER_STALE_MAX_MS_ENV, ttlMs * 2, 1),
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
    // 与 globalGen 同一条理由：epoch 回退会让"上次全局失效之前"拼出的旧键重新可命中。
    globalEpoch: previous?.globalEpoch ?? 0,
    config,
    bus: null,
    unsubscribe: null,
    busErrors: 0,
    now: overrides.now ?? Date.now,
    // §SC-45 失效波是**可观测快照**，不跨 reset/热重载保留：旧进程的波带着旧 epoch，
    // 与新 store 的 epoch 撞值会误导运维。reset = 观测从零重新计数（与 globalEpoch 的"必须保留"相反）。
    activeWave: null,
    settledWaves: [],
    // §SC-46 降级计数是**本进程此刻的账**，不跨 reset（与波一样是观测快照，不是要保住的水位线）。
    staleServed: 0,
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

/**
 * JSON 数组编码，viewerId 含 `|`/`:` 也不会与别的 (viewer,sort,limit) 组合碰撞。limit 缺省按 discover 的 24。
 * 键四段：`discover:v1|<globalEpoch>|<generation>|<JSON>`。
 * - `globalEpoch`（§SC-44）：全缓存世代，新作品发布/下架 +1 → 所有旧键（含匿名、含已缓存 viewer）
 *   一次性拼不出来；跨实例经总线广播同步。
 * - `generation`（§SC-41）：该 viewer 的私有关系世代，屏蔽/关注变更 +1 → 只失效这个人。
 * 两者正交：全局内容变更不动 privacy 分键，privacy 变更不动全局世代。
 */
function keyFor(s: Store, input: DiscoverCacheInput): string {
  const viewerId = input.viewerId ?? null;
  const generation = generationFor(s, viewerId);
  return `discover:v1|${s.globalEpoch}|${generation}|${JSON.stringify([viewerId, input.sort, input.limit ?? 24])}`;
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

/* ── §SC-45 失效波采集：纯函数，不碰 DB / 不改缓存行为，只读 loads 差值与在途采样 ── */

/** 开一波：把上一波（若还在窗口内）先定格归档，再以当前 epoch 开新的可变波。 */
function openWave(s: Store, now: number): void {
  if (s.activeWave) pushWave(s, settleWave(s.activeWave), s.config.waveCapacity);
  s.activeWave = {
    epoch: s.globalEpoch,
    openedAtMs: now,
    loadsAtOpen: s.cache.stats().loads,
    loadsDelta: 0,
    peakInFlight: 0,
    firstFillMs: null,
  };
}

/** 每次读之后采样当前波：差值即这一波真打库数，瞬时 inFlight 取最大，首击记延迟。 */
function sampleWave(s: Store, now: number): void {
  const w = s.activeWave;
  if (!w) return;
  const stats = s.cache.stats();
  const delta = Math.max(0, stats.loads - w.loadsAtOpen);
  w.loadsDelta = delta;
  if (stats.inFlight > w.peakInFlight) w.peakInFlight = stats.inFlight;
  if (delta > 0 && w.firstFillMs === null) w.firstFillMs = Math.max(0, now - w.openedAtMs);
}

/** 冻结一波成不可变读数。 */
function settleWave(w: MutableWave): EpochWave {
  return {
    epoch: w.epoch,
    openedAtMs: w.openedAtMs,
    loadsDelta: w.loadsDelta,
    peakInFlight: w.peakInFlight,
    firstFillMs: w.firstFillMs,
    settled: true,
  };
}

/**
 * 惰性定格：窗口过了就归档、清空 activeWave。由 stats/readout 与下一次读驱动，不靠定时器
 * （无定时器 = 无后台资源、无热重载残留）。返回是否刚定格了一波。
 */
function settleWaveIfExpired(s: Store, now: number): boolean {
  const w = s.activeWave;
  if (!w || now - w.openedAtMs <= s.config.waveWindowMs) return false;
  pushWave(s, settleWave(w), s.config.waveCapacity);
  s.activeWave = null;
  return true;
}

/** 有界环形缓冲：push 后超容量就丢最旧一条（内存不随发布次数增长）。 */
function pushWave(s: Store, wave: EpochWave, capacity: number): void {
  s.settledWaves.push(wave);
  const cap = Math.max(1, capacity);
  while (s.settledWaves.length > cap) s.settledWaves.shift();
}

/** 供 stats/readout 组装：已定格波（最近在前）+ 仍进行中的波（未定格、读数还在变）。 */
function wavesReadout(s: Store, now: number): readonly EpochWave[] {
  settleWaveIfExpired(s, now);
  const settled = [...s.settledWaves].reverse(); // 新的在前
  const w = s.activeWave;
  if (!w) return settled;
  const active: EpochWave = {
    epoch: w.epoch,
    openedAtMs: w.openedAtMs,
    loadsDelta: w.loadsDelta,
    peakInFlight: w.peakInFlight,
    firstFillMs: w.firstFillMs,
    settled: false,
  };
  return [active, ...settled];
}

/**
 * §SC-44/45 全局世代跳变的**单一内核**：本机写路径（publish/unpublish/rejected）与远端全局帧
 * 共用这一句，杜绝两处逻辑漂移。顺序是承诺的一部分：
 * 1. 先 `globalEpoch += 1`（主业）——所有旧键（含匿名）当场拼不出来，本机即时生效、fail-open 最后一道；
 * 2. 再开观测波（SC-45）——纯内存记账，**绝不因为它的失败/抛错反过来破坏上面的失效**。
 *    故观测用 try/catch 兜住：SC-44「失效绝不抛、绝不阻塞写库请求」的承诺一字不改地延续。
 */
function bumpEpochAndOpenWave(s: Store, now: number): void {
  s.globalEpoch += 1;
  try {
    openWave(s, now);
  } catch {
    /* 观测失败绝不影响 epoch bump 与缓存键失效：主业与观测严格隔离 */
  }
}

/** 写路径调用：让这些 viewer 的所有旧键**即时**失效，并把这一帧广播给别的实例。匿名 `null` 是 no-op。 */
export function invalidateDiscoverFor(...viewerIds: (string | null | undefined)[]): void {
  invalidateInStore(getStore(), viewerIds);
}

/**
 * §SC-44 全局失效内核：新作品发布/下架/审核拒绝走到这里——内容对所有 viewer 都是新的，
 * 必须让**所有键**（匿名共享 + 每个登录 viewer 的每个 sort）一次性拼不出来。
 *
 * 顺序与 `invalidateInStore` 同一纪律：**本机 `globalEpoch += 1` 永远先做**（本机即时生效、
 * fail-open 最后一道），再 fire-and-forget 广播全局帧；广播失败也不回退、不抛、不阻塞写库请求。
 *
 * 为什么 not 复用 `globalGen`、also not `viewerGen.clear()`：
 * - 匿名 generation 恒 0、已缓存 viewer 读缓存值，`++globalGen`/清表都动不了它们的现有键；
 * - 只有把 epoch 放进**每个键**才能无条件作废旧键。清 `viewerGen` 是可选的 LRU 释放，但
 *   **不能**靠它做失效（匿名根本不在表里），故这里刻意不动它，保持"epoch 是唯一全局闸门"。
 *
 * 惊群诚实边界（写进 ADR-0116）：全局失效 ≈ 一次冷启动，singleflight 只合并**同键**并发、
 * 不跨键，故打库量随活跃 (viewer,sort,limit) 组合数上升。这是"发布即时可见"的直接代价，
 * 不是 bug；常态发布频率下可接受，代价与收益都在面板 `globalEpoch` 读数里可见。
 */
function invalidateAllInStore(s: Store): void {
  // 1. 本机即时：epoch +1 让所有旧键（含匿名）拼不出来，并开一个只记不拦的失效波采样窗口。
  //    观测"这一波重填真打了几库 / 峰值在途 / 首击延迟"——零新 DB 查询、零生产行为变化。
  //    epoch bump 在前、观测在后且有 try/catch 兜底，SC-44 的失效承诺不受影响（见 bumpEpochAndOpenWave）。
  bumpEpochAndOpenWave(s, s.now());
  s.bus?.publish([], true); // 2. 净辐射广播全局帧（同步 void、绝不 await/不抛）
}

/**
 * §SC-44 写路径调用：让**所有 viewer、所有 sort** 的发现页缓存即时失效。
 * 只在"发现页收录状态真的改变"时调——public 发布 / 从 public 下架 / public 内容被 rejected；
 * private/unlisted 发布与 approved 裁决不改变发现页收录，不调（避免无意义地清空全站缓存造惊群）。
 */
export function invalidateDiscoverGlobally(): void {
  invalidateAllInStore(getStore());
}

/**
 * 取或加载的参数化内核（全局入口与多实例测试工厂共用）。同 viewer/sort/limit 并发只跑一次 loader。
 *
 * §SC-45 只记不拦的采样点为什么要**两处**：
 * - `getOrLoad` 是 async，但调用它的同步段已完成 `inflight.set` 与 `loads += 1`（见 BoundedCache）。
 *   故**调用后立刻**采一次，才抓得到「我 + 其它并发重填」的瞬时在途峰值；若等 `await` 返回再采，
 *   `fromLoad` 的 finally 已清掉 inflight，`peakInFlight` 会恒为 0——那是谎报「没有惊群」。
 * - loader 收尾（含失败）后再采一次：并发键可能稍后才登记，这里把 `loadsDelta` / `firstFillMs`
 *   更新到本轮最新值。两次都 try/catch 兜住：观测绝不许拖垮发现页读主业。
 */
async function loadFromStore(s: Store, input: DiscoverCacheInput, loader: DiscoverLoader): Promise<DiscoverResult> {
  const key = keyFor(s, input); // 请求开始时锁定的键（含此刻的 epoch + generation）
  const pending = s.cache.getOrLoad(key, loader);
  try {
    sampleWave(s, s.now());
  } catch {
    /* 观测失败不影响加载 */
  }
  try {
    return (await pending).value;
  } catch (error) {
    // §SC-46 上游失败：交给降级判据，能端合法旧值就端，否则原样重抛（绝不画空、绝不冒充此刻）。
    return serveStaleOrThrow(s, input, key, error);
  } finally {
    try {
      sampleWave(s, s.now());
    } catch {
      /* 观测失败不影响返回值/异常传播 */
    }
  }
}

/**
 * §SC-46 上游失败降级的判据内核：只有三个条件**同时**成立才端旧值，否则原样重抛上游异常。
 *
 * 1. **键仍有效（隐私/收录红线，最容易被漏掉的一条）**：`key` 是 loader 开始前算的。若 loader
 *    执行期间发生了 block（generation 重分配）或 public 发布（epoch +1），`keyFor` 会拼出**不同**的
 *    当前键。而 SC-41 的失效纪律是"只删 generation 表条目、不删 cache 表条目"——故 `peek(key)` 此刻
 *    **仍能拿到旧条目**，那份可能含刚被拉黑的人 / 刚下架的内容。所以必须先重算 `keyFor` 比对：
 *    键变了就绝不端，直接重抛。重算会懒分配一次新 generation（若期间被定向失效），那正是失效该付的代价。
 * 2. **有旧条目**：首次冷启动就失败、或条目已被 LRU 淘汰 → `peek` 为 null → 重抛（无旧值不画空）。
 * 3. **旧值够新**：`ageMs <= staleMaxMs`。`peek` 的 expired 条目 ageMs **无上界**（键长期没人读会
 *    滞留到 LRU 淘汰），故必须卡龄；超界宁可报错，也不把几小时前的发现页冒充"还能看"。
 *
 * 降级对内容消费者**透明**（返回类型仍是 DiscoverResult，不新增状态字段、不改 route/page）——发现页
 * 本无"此刻"承诺，正常缓存命中本就是 TTL 内的旧值。但通过 `staleServed` 对运维**完全可观测**，
 * 否则 DB 抖动被悄悄吞掉。降级路径只做同步 `peek`、不碰 `getOrLoad`，故不会引入嵌套 singleflight 死锁。
 * 任何降级自身的意外（keyFor/peek 抛错）都**绝不掩盖上游原始异常**，落到统一的 `throw cause`。
 */
function serveStaleOrThrow(s: Store, input: DiscoverCacheInput, keyRequested: string, cause: unknown): DiscoverResult {
  try {
    // 1. 键有效性校验：期间发生隐私/收录失效 → 当前键变了 → 旧条目不可信，绝不端。
    if (keyFor(s, input) === keyRequested) {
      const old = s.cache.peek(keyRequested); // 2. 有旧条目？
      if (old && old.ageMs <= s.config.staleMaxMs) {
        // 3. 够新。才端出——且只对运维记账，不往 DiscoverResult 里塞降级状态（保持领域类型纯净）。
        s.staleServed += 1;
        return old.value;
      }
    }
  } catch {
    /* 降级路径自身的意外绝不吞掉上游异常，也绝不凭空造空结果；统一落到下面的原样重抛。 */
  }
  throw cause; // 无合法旧值 / 键已失效 / 超界 / 降级出错 → 原样重抛，不画空、不冒充此刻
}

/**
 * 取或加载一份发现页结果。loader 由 `social.discoverCached` 注入（此处不 import social 运行时值，
 * 依赖单向无环）。同 viewer/sort/limit 并发只跑一次 loader；不同 viewer 永不合并。
 */
export async function loadDiscoverCached(input: DiscoverCacheInput, loader: DiscoverLoader): Promise<DiscoverResult> {
  return loadFromStore(getStore(), input, loader);
}

/**
 * §SC-45：把 stats 组装抽成共用内核（全局门面与 isolated 测试 store 共用这一句，杜绝两处漂移）。
 * `waves` 读数会驱动一次惰性定格（窗口已过的波归档），纯内存、无定时器、无 DB 查询。
 */
function statsFromStore(s: Store): DiscoverCacheStats {
  return {
    ...s.cache.stats(),
    globalGen: s.globalGen,
    globalEpoch: s.globalEpoch,
    viewerGenerations: s.viewerGen.size,
    config: s.config,
    bus: s.bus ? { ...s.bus.stats(), errors: s.bus.stats().errors + s.busErrors } : null,
    waves: wavesReadout(s, s.now()),
    waveConfig: { windowMs: s.config.waveWindowMs, capacity: s.config.waveCapacity },
    staleServed: s.staleServed,
  };
}

export function discoverCacheStats(): DiscoverCacheStats {
  return statsFromStore(getStore());
}

/**
 * §SC-43：面板用的只读门面。返回**可安全 JSON 化**的读数 + 一句部署描述，
 * route 不直接触达内部 Store 结构（那是 `discover-cache` 的私有领地）。
 *
 * 加一个 `measuredAt`：这份读数也是"此刻这一台实例"的快照，带时间才诚实——
 * 面板据此显示"更新于"，且页脚说明多实例各算各的、总线是最终一致。
 */
export interface DiscoverCacheReadout {
  readonly measuredAt: string;
  readonly stats: DiscoverCacheStats;
  /** 这台实例此刻有没有接跨实例总线；null 读数是"单机/未接"，不是"接了但全 0" */
  readonly busAttached: boolean;
  readonly busUrlConfigured: boolean;
}

export function describeDiscoverCache(): DiscoverCacheReadout {
  const stats = discoverCacheStats();
  return {
    measuredAt: new Date().toISOString(),
    stats,
    busAttached: stats.bus !== null,
    busUrlConfigured: Boolean(process.env[DISCOVER_INVALIDATION_URL_ENV]?.trim()),
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
  /** §SC-44：全局失效（新作品发布/下架），让所有键拼不出来并广播给同 hub 其它实例。 */
  invalidateAll(): void;
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
  waveWindowMs?: number;
  waveCapacity?: number;
  staleMaxMs?: number;
}): IsolatedDiscoverCache {
  const ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
  const config: DiscoverCacheConfig = {
    ttlMs,
    maxEntries: options.maxEntries ?? DEFAULT_MAX_ENTRIES,
    maxViewers: options.maxViewers ?? DEFAULT_MAX_VIEWERS,
    waveWindowMs: options.waveWindowMs ?? DEFAULT_WAVE_WINDOW_MS,
    waveCapacity: options.waveCapacity ?? DEFAULT_WAVE_CAPACITY,
    staleMaxMs: options.staleMaxMs ?? ttlMs * 2,
  };
  const now = options.now ?? Date.now;
  const cache = new BoundedCache<DiscoverResult>({
    maxEntries: config.maxEntries,
    ttlMs: config.ttlMs,
    now,
  });
  const s: Store = {
    cache,
    viewerGen: new Map<string, number>(),
    globalGen: 0,
    globalEpoch: 0,
    config,
    bus: options.bus ?? null,
    unsubscribe: null,
    busErrors: 0,
    now,
    activeWave: null,
    settledWaves: [],
    staleServed: 0,
  };
  // 与全局 store 的 attachBus 同一语义：定向帧 → bumpLocal，全局帧 → bump epoch（共用内核）。
  if (s.bus) {
    s.unsubscribe = s.bus.subscribe((ids, global) => {
      // §SC-45 远端实例收到全局帧同样经历冷启动，必须开自己的波，否则多实例下只有发布那台尖峰可见。
      if (global === true) bumpEpochAndOpenWave(s, s.now());
      else bumpLocal(s, ids);
    });
  }
  return {
    load: (input, loader) => loadFromStore(s, input, loader),
    invalidate: (...ids) => invalidateInStore(s, ids),
    invalidateAll: () => invalidateAllInStore(s),
    stats: () => statsFromStore(s),
    keyFor: (input) => keyFor(s, input),
    dispose: () => {
      s.unsubscribe?.();
      // 注意：不 dispose bus——测试里多个实例共享同一条/各自持有的 bus，由测试统一收摊。
    },
  };
}
