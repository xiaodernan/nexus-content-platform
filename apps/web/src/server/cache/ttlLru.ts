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

export class TtlLru<K, V> {
  private readonly store = new Map<K, V>();
  private readonly expiry = new Map<K, number>();
  private readonly maxEntries: number;
  private readonly defaultTtlMs: number;

  constructor(options: TtlLruOptions = {}) {
    this.maxEntries = options.maxEntries ?? 256;
    this.defaultTtlMs = options.defaultTtlMs ?? 30_000;
  }

  /** 命中就 true，且把条目刷新到最新（LRU）。 */
  get(key: K, now = Date.now()): V | undefined {
    const expiresAt = this.expiry.get(key);
    if (expiresAt !== undefined && now >= expiresAt) {
      // 读到过期的：当场删掉，别让它占着容量
      this.store.delete(key);
      this.expiry.delete(key);
      return undefined;
    }
    const value = this.store.get(key);
    if (value === undefined) return undefined;
    this.store.delete(key);
    this.expiry.delete(key);
    this.store.set(key, value);
    this.expiry.set(key, expiresAt!);
    return value;
  }

  /** 命中返回 undefined 以外的值。每条条目带不带自定义 TTL，由调用决定。 */
  set(key: K, value: V, ttlMs?: number, now = Date.now()): void {
    const ttl = ttlMs ?? this.defaultTtlMs;
    const existing = this.store.delete(key);
    if (existing) this.expiry.delete(key);
    this.store.set(key, value);
    this.expiry.set(key, ttl === 0 ? Number.POSITIVE_INFINITY : now + ttl);
    this.evictIfNeeded();
  }

  /** 删除。返回条目是否存在（存在一次）。 */
  delete(key: K): boolean {
    const had = this.store.delete(key);
    this.expiry.delete(key);
    return had;
  }

  /** 当前未过期的条数——不是"存了几条"，是"现在能命中几条"。 */
  liveSize(now = Date.now()): number {
    let count = 0;
    for (const [, expiresAt] of this.expiry) {
      if (expiresAt > now) count += 1;
    }
    return count;
  }

  /** 全清。只用于测试与安全计数器的掉线路径；不与调用方的键命名空间共享。 */
  clear(): void {
    this.store.clear();
    this.expiry.clear();
  }

  private evictIfNeeded(): void {
    while (this.store.size > this.maxEntries) {
      // Map 的插入序就是 LRU——头部是最久没被碰的那一条
      const oldest = this.store.keys().next();
      if (oldest.done) break;
      this.store.delete(oldest.value);
      this.expiry.delete(oldest.value);
    }
  }
}
