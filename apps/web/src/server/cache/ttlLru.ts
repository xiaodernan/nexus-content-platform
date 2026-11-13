/**
 * 有界的 LRU + TTL 进程内缓存——服务器热路径专用（§46）。
 *
 * 存在的理由，说否定句最容易看清楚：不缓存时，每次请求都重算一遍（重新下一次 SQL 或一整套
 * 衍生）；只按 TTL 缓存时，足迹随写入单调涨，上界没有；只按 LRU 缓存时，陈旧数据不自己过期。
 *
 * 三条语义（谁先读先知道怎么改）：
 * 1. 命中就刷新到最新——Map 插入序即 LRU 序，命中时 delete 再 set，最近碰过的永远在尾部，
 *    淘汰从头部 O(1) 走，热路径不会因此线性扫描；
 * 2. 读的时候才过期——写入不主动清扫，读到过期的条目当场按"没有"处理并删除它自己；
 * 3. 上界到了就淘汰最久没碰的那条——每次 put 只淘汰一条，换来上界被洪水顶住时行为线性。
 *
 * 不做的事，也说一遍：
 * - 不自己计费、不驱逐跨进程共享（那是 Redis 的工作，ADR-0076/0028）；
 *   这一只只缓存"能由这台进程独立重算"的东西；
 * - 不带版本号、不主动吊销——调用方自己决定键的命名空间里含不含版本（含就自动换代）；
 *   盲目 DEL 式的吊销在这里只会把自己的命中率打成 0（§46 那句"缓存要有自己的寿命"的小注）。
 *
 * ## 存储形状：一张 Map，不是两张（v672 / ADR 0105）
 * 此前值与过期时刻分放 `store: Map<K,V>` 与 `expiry: Map<K,number>` 两张表——于是命中要
 * 6 次哈希操作（`expiry.get` + `store.get` + 两表各 `delete`/`set`）、每个键哈希两遍、在内存里
 * 存两份、LRU 序还要在两张表之间各自维护；更隐蔽的是 `get` 里 `expiresAt!` 那个非空断言，靠的
 * 是"两表始终同键"这个**代码里没有任何结构保证**的不变量，一旦某条路径只删了一张表，命中就会
 * 把 undefined 的过期时刻当成"永不过期"。
 * 现在合成一张 `Map<K, TtlEntry<V>>`：命中 3 次操作（get + delete + set）、键只哈希/存一份、
 * LRU 序天然同源，`expiresAt` 与 `value` 绑在同一个条目里，那个不变量**由结构本身消掉**。
 * 复杂度契约门（`ds-complexity-contract.test.ts`）钉的是"命中成本与容量无关 + 有常数上界"的
 * **形状**而非具体次数，所以这一次 6→3 的正当优化不会把门改红；before/after 墙钟对照与
 * 全部语义门见 ADR 0105 / docs/PERFORMANCE.md。
 */
export interface TtlLruOptions {
  /** 最多保留多少条。超过时淘汰最久没碰的那条。 */
  maxEntries?: number;
  /** 默认 TTL（毫秒）。0 = 只由调用方给每条条目定 TTL，不设默认。 */
  defaultTtlMs?: number;
}

export interface TtlEntry<V> {
  value: V;
  expiresAt: number;
}

export interface TtlLruStats {
  /** Entries present (including ones not yet read-and-swept). */
  size: number;
  /** Entries that survived the last sweep but would expire now. */
  liveSize: number;
  /** Total number of `maxEntries` induced evictions recorded lifetime. */
  evictedCount: number;
  /** Total number of inserts (count, not unique keys). */
  sets: number;
  /** Total number of gets. */
  gets: number;
  /** gets that found an unexpired value. */
  hits: number;
}

export class TtlLru<K, V> {
  /** 唯一的表：插入序即 LRU 序；值与过期时刻同条目，不再需要第二张表去对齐它们。 */
  private readonly store = new Map<K, TtlEntry<V>>();
  private readonly maxEntries: number;
  private readonly defaultTtlMs: number;
  private evictedCount = 0;
  private sets = 0;
  private gets = 0;
  private hits = 0;

  constructor(options: TtlLruOptions = {}) {
    this.maxEntries = options.maxEntries ?? 256;
    this.defaultTtlMs = options.defaultTtlMs ?? 30_000;
  }

  /** 命中就 true. */
  get(key: K, now = Date.now()): V | undefined {
    this.gets += 1;
    const entry = this.store.get(key);
    if (entry === undefined) return undefined;
    if (now >= entry.expiresAt) {
      // 读到过期：删自身，按"没有"处理。不刷新 LRU 序（它本来就该被淘汰）。
      this.store.delete(key);
      return undefined;
    }
    // 命中：刷到插入序尾部。先删再写，最近碰过的永远在尾部。
    this.store.delete(key);
    this.store.set(key, entry);
    this.hits += 1;
    return entry.value;
  }

  /** 把一个条目存入或替换。带 TTL 的轻触发淘汰。 */
  set(key: K, value: V, ttlMs?: number, now = Date.now()): void {
    const ttl = ttlMs ?? this.defaultTtlMs;
    // 同键覆盖：Map.set 直接替换值且**不**改变该键的插入序位置——这与旧版"先 delete 再 set
    // 把它挪到尾部"不同。为保持"set 同键 = 最近碰过"的 LRU 语义（与命中一致），显式 delete。
    this.store.delete(key);
    this.store.set(key, { value, expiresAt: ttl === 0 ? Number.POSITIVE_INFINITY : now + ttl });
    this.sets += 1;
    this.evictIfNeeded();
  }

  /** 删除。返回条目是否存在（存在一次）。 */
  delete(key: K): boolean {
    return this.store.delete(key);
  }

  /** 当前未过期的条数——不是"存了几条"，是"现在能命中几条"。读，不删。 */
  liveSize(now = Date.now()): number {
    let count = 0;
    for (const [, entry] of this.store) {
      if (entry.expiresAt > now) count += 1;
    }
    return count;
  }

  /** 这台进程对这张表做了什么——对系统提示他的唯一有根据的可见度 */
  stats(now = Date.now()): TtlLruStats {
    return {
      size: this.store.size,
      liveSize: this.liveSize(now),
      evictedCount: this.evictedCount,
      sets: this.sets,
      gets: this.gets,
      hits: this.hits,
    };
  }

  /** 全清。只用于测试与安全计数器的掉线路径；不与调用方的键命名空间共享。 */
  clear(): void {
    this.store.clear();
  }

  private evictIfNeeded(): void {
    while (this.store.size > this.maxEntries) {
      const oldest = this.store.keys().next();
      if (oldest.done) break;
      this.store.delete(oldest.value);
      this.evictedCount += 1;
    }
  }
}
