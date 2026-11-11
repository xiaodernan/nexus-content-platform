/**
 * 有界 TTL + LRU 缓存，外加 singleflight（同键合并）。
 *
 * 三个机制各自挡一种真实的坏法，缺一个都不完整：
 *
 * 1. **TTL**：网关的 `/platform/*` 是 point-in-time 快照。缓存它必须带着"这是哪一刻的事实"，
 *    过期就要重问，否则运维盯的是一台已经下线服务的旧照片。TTL 让"缓存的是带日期的事实"成立。
 * 2. **有界 + LRU**：键来自 service id / 路径，而 service id 是注册中心说了算的——一个能注册
 *    任意 id 的发现源，等于能决定本进程留多少条缓存。无界 Map 是一道闸自己变成内存漏点
 *    （与 `rateLimitMemory` 的 `maxBuckets` 同一句话）。LRU 淘汰最久未用的，热点留得住。
 * 3. **singleflight**：面板每 4 秒轮询，N 个 admin 浏览器在同一刻并发问同一个键；不合并就会
 *    在同一瞬间对网关发出 N 份完全相同的 health 扇出（后端要答 N×M 次）。同键的后来者等第一发，
 *    而不是各自再打一遍——这是缓存层能给出的最直接的降载。
 * 4. **clear 与在途的边界（§SC-49）**：`clear()` 只清 `map` / `inflight` / 计数还不够——那一发
 *    正在跑的 loader 稍后仍会在 `fromLoad` 里 `set()` 回 map，把刚清空的缓存"复活"一条，且计数
 *    已归零，读数会变成 `size=1 / loads=0` 这种自相矛盾的账。用单调 generation 让在途回写作废：
 *    值照样交回等它的调用者（那份数据是真的），只是不再落库。
 *
 * 纯内存、零依赖、时间由外部注入（`now()`），所以 TTL 与淘汰都能被判据逐条验电，不靠 sleep。
 */

interface Entry<V> {
  readonly value: V;
  readonly storedAtMs: number;
  readonly storedAt: string;
}

export interface CachedEntry<V> {
  readonly value: V;
  readonly ageMs: number;
  readonly storedAt: string;
  /** 已过 TTL 但仍在表中（等 singleflight 或上层决定是否端出）——上层据此标 cached/stale */
  readonly expired: boolean;
}

export interface CacheStats {
  readonly hits: number;
  readonly misses: number;
  readonly evictions: number;
  readonly loads: number;
  readonly inFlight: number;
  readonly size: number;
}

export interface BoundedCacheOptions {
  readonly maxEntries: number;
  readonly ttlMs: number;
  readonly now?: () => number;
  readonly clock?: () => string;
}

export class BoundedCache<V> {
  private readonly map = new Map<string, Entry<V>>();
  private readonly inflight = new Map<string, Promise<V>>();
  private readonly now: () => number;
  private readonly clock: () => string;
  private readonly counters = { hits: 0, misses: 0, evictions: 0, loads: 0 };
  /**
   * §SC-49：缓存世代。只在 `clear()` 时 +1，用来识别"发起于清空之前、却跑在清空之后"的在途加载。
   * 单片程内单调即可，不跨实例、不持久化——它只解决同一 `BoundedCache` 实例内 clear 与在途的竞态。
   */
  private generation = 0;

  constructor(private readonly options: BoundedCacheOptions) {
    this.now = options.now ?? Date.now;
    this.clock = options.clock ?? (() => new Date().toISOString());
  }

  get maxEntries(): number {
    return Math.max(1, this.options.maxEntries);
  }

  get ttlMs(): number {
    return Math.max(0, this.options.ttlMs);
  }

  /** 读一份值；命中把条目挪到 LRU 尾（最近用）。过期返回 null，但**不删**——见 takeIfPresent。 */
  get(key: string): CachedEntry<V> | null {
    const entry = this.map.get(key);
    if (!entry) {
      this.counters.misses += 1;
      return null;
    }
    // LRU：命中即刷新顺序（Map 删除后重插 = 移到尾）
    this.map.delete(key);
    this.map.set(key, entry);
    const ageMs = Math.max(0, this.now() - entry.storedAtMs);
    if (ageMs > this.ttlMs) {
      this.counters.misses += 1;
      return { value: entry.value, ageMs, storedAt: entry.storedAt, expired: true };
    }
    this.counters.hits += 1;
    return { value: entry.value, ageMs, storedAt: entry.storedAt, expired: false };
  }

  /** 即便过期也端出旧值——供上游失败时 stale 兜底。区别于 get 的"过期即未命中"。 */
  peek(key: string): CachedEntry<V> | null {
    const entry = this.map.get(key);
    if (!entry) return null;
    const ageMs = Math.max(0, this.now() - entry.storedAtMs);
    return { value: entry.value, ageMs, storedAt: entry.storedAt, expired: ageMs > this.ttlMs };
  }

  set(key: string, value: V): CachedEntry<V> {
    // 重插刷新 LRU 顺序
    this.map.delete(key);
    const storedAtMs = this.now();
    const storedAt = this.clock();
    this.map.set(key, { value, storedAtMs, storedAt });
    while (this.map.size > this.maxEntries) {
      const oldest = this.map.keys().next().value as string | undefined;
      if (oldest === undefined) break;
      this.map.delete(oldest);
      this.counters.evictions += 1;
    }
    return { value, ageMs: 0, storedAt, expired: false };
  }

  delete(key: string): void {
    this.map.delete(key);
  }

  /**
   * 取或加载：新鲜命中直接返回；否则同键并发只让第一发真正跑 loader（singleflight）。
   * loader 抛错时**不**写缓存、不把失败的 promise 留给后来者——下次轮询可以重试。
   */
  async getOrLoad(key: string, loader: () => Promise<V>): Promise<CachedEntry<V>> {
    const hit = this.get(key);
    if (hit && !hit.expired) return hit;
    const running = this.inflight.get(key);
    // §SC-49：记下"这一发属于哪个世代"。follower 与 leader 都捕获同一刻的 gen，
    // 于是 clear 之后才进来、复用旧在途的后来者也会被一起挡住，不会替旧世代回写。
    const gen = this.generation;
    if (running) return this.fromLoad(key, running, gen);
    const load = Promise.resolve().then(loader);
    this.inflight.set(key, load);
    this.counters.loads += 1;
    return this.fromLoad(key, load, gen);
  }

  private async fromLoad(key: string, load: Promise<V>, genAtStart: number): Promise<CachedEntry<V>> {
    try {
      const value = await load;
      // §SC-49：若这一发在途期间被 clear() 过（gen 已递增），它的结果属于旧世界——
      // 值照样交回等它的调用者（那份数据本身是真的、当时确实查到了），但绝不写回 map：
      // 否则刚被清空、counters 刚归零的缓存会被一条迟到结果"复活"成 size=1 / loads=0 的假账。
      if (genAtStart !== this.generation) {
        return { value, ageMs: 0, storedAt: this.clock(), expired: false };
      }
      // 只有真正发起那一发负责写缓存；后来者 await 同一个 promise 后也走这里，重复 set 无害
      //（重插同一份值、刷新同一时刻），但会多刷一次 LRU 顺序，影响可忽略且结果确定。
      return this.set(key, value);
    } finally {
      // 成功或失败都清掉在途标记：失败后必须允许下一次轮询重新加载，不能永远钉住一个 rejected promise。
      // 注意不判断 gen：clear() 已清空 inflight，这里 `inflight.get(key) === load` 为假、不会误删
      // clear 之后新发起的那一发；若没被 clear，则仍精确清掉自己。两种情形都安全，无需加世代判断。
      if (this.inflight.get(key) === load) this.inflight.delete(key);
    }
  }

  stats(): CacheStats {
    return {
      ...this.counters,
      inFlight: this.inflight.size,
      size: this.map.size,
    };
  }

  clear(): void {
    // §SC-49：先递增世代，让此刻所有在途 fromLoad 的 genAtStart 立刻过期（回写会被挡在 set 之前）。
    // 单句、同步、无 await：clear 返回后不会再有任何旧结果写进来。
    this.generation += 1;
    this.map.clear();
    this.inflight.clear();
    this.counters.hits = 0;
    this.counters.misses = 0;
    this.counters.evictions = 0;
    this.counters.loads = 0;
  }
}
