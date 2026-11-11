import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TtlLru } from '@/server/cache/ttlLru';
import { MemoryRateLimiter } from '@/server/security/rateLimitMemory';

/**
 * v671 / ADR 0104（+ v672 / ADR 0105 的单 Map 形状门）：两张热路径数据结构的**复杂度契约**——量的是"每操作花几次哈希/迭代"，
 * 不是墙钟毫秒。
 *
 * 为什么不用时间断言（docs/PERFORMANCE.md 那一支 `scripts/ds-benchmark.mts` 才报时间）：
 * 这台是共享宿主，毫秒读数被 GC、JIT 与并行 lane 的 CPU 争抢主导，把阈值写死只会制造 flaky，
 * 而 flaky 的终点通常是把断言删掉。**确定性可断言的是形状**：`TtlLru` 命中是否 O(1)（不随容量
 * 出现全表扫描）、`MemoryRateLimiter` 顶到上界后是否每次只淘汰一只（摊还 O(1)，而不是让
 * "防内存耗尽"自己变成每次扫全表的放大攻击）。这两条正是两张结构页眉用长篇注释承诺、
 * 却从来没有被门钉住的性质——语义门（`ttl-lru.test.ts` / `rateLimit.test.ts`）只问"答案对不对"，
 * 不问"成本会不会随规模塌"。
 *
 * 手法：临时包住 `Map.prototype.get/set/delete/Symbol.iterator` 计数（vi.spyOn 自动还原），
 * 在**同步被测区间**前后 mockClear，于是计数里只有被测结构自己的操作，没有 vitest 或微任务的份。
 * `MemoryRateLimiter.hit` 虽是 async，但函数体内没有 await——整段在返回那个已 resolve 的 Promise
 * 之前同步跑完，所以紧跟调用读到的计数就是这一笔 hit 的全部成本。
 *
 * 判据刻意不硬编码"命中=6 次"：那会把将来"双 Map → 单 Map"的正当优化（命中 6→3）判红。
 * 钉的是**与容量无关 + 有常数上界 + 洪水时逐笔相等**，这三条才同时有牙又不惩罚正当改动。
 */
afterEach(() => {
  vi.restoreAllMocks();
});

/**
 * 包住 Map 的四个结构操作计数。关键次序：**先存原方法引用，再 spy，让 spy 转发给原引用**——
 * 若在 mock 里再读 `Map.prototype.get`，拿到的是 spy 自己，会无限递归。
 */
function mapOpCounter() {
  const proto = Map.prototype as unknown as Record<string | symbol, (...args: unknown[]) => unknown>;
  const original = {
    get: proto.get!,
    set: proto.set!,
    delete: proto.delete!,
    iter: proto[Symbol.iterator]!,
  };
  let count = 0;
  const bump = <T extends (...args: never[]) => unknown>(fn: T) =>
    function (this: unknown, ...args: never[]) {
      count += 1;
      return Reflect.apply(fn, this, args);
    };
  vi.spyOn(Map.prototype, 'get').mockImplementation(bump(original.get as never) as never);
  vi.spyOn(Map.prototype, 'set').mockImplementation(bump(original.set as never) as never);
  vi.spyOn(Map.prototype, 'delete').mockImplementation(bump(original.delete as never) as never);
  vi.spyOn(Map.prototype, Symbol.iterator).mockImplementation(bump(original.iter as never) as never);
  return {
    reset: () => {
      count = 0;
    },
    value: () => count,
  };
}

describe('TtlLru 命中的摊还成本与容量无关（O(1) 形状门）', () => {
  it('容量 8 与 8192 的两张满表，单次命中的 Map 操作数相等且有常数上界', () => {
    const counter = mapOpCounter();
    const perHit: number[] = [];
    for (const capacity of [8, 8192]) {
      const cache = new TtlLru<number, number>({ maxEntries: capacity, defaultTtlMs: 0 });
      for (let i = 0; i < capacity; i += 1) cache.set(i, i);

      counter.reset();
      for (let i = 0; i < 64; i += 1) cache.get(i % capacity);
      const opsPerHit = counter.value() / 64;
      expect(Number.isInteger(opsPerHit)).toBe(true); // 64 次命中每次成本完全一样，才会整除
      expect(opsPerHit, `容量 ${capacity} 下命中不该出现全表扫描`).toBeLessThanOrEqual(8);
      perHit.push(opsPerHit);
    }
    expect(perHit[0], '容量涨 1024 倍，命中成本必须不变——变一次就说明混进了线性扫描').toBe(perHit[1]);
  });

  it('写入不是命中时仍付同样多的常数操作；踢除洪水不随表大小变贵', () => {
    const counter = mapOpCounter();
    const cache = new TtlLru<number, number>({ maxEntries: 256, defaultTtlMs: 0 });

    // 还没顶到上界：每条 set 的 Map 操作数。
    counter.reset();
    for (let i = 0; i < 100; i += 1) cache.set(i, i);
    const setBeforeCap = counter.value() / 100;

    // 顶到上界后继续灌：每条 set（含踢除一条）的平均操作数必须仍是同一个常数。
    counter.reset();
    for (let i = 100; i < 20_000; i += 1) cache.set(i, i);
    const setAtCap = counter.value() / 19_900;

    expect(setBeforeCap, '单次写入有常数上界').toBeLessThanOrEqual(8);
    expect(setAtCap, '顶到上界后每次只踢一条——成本不得随 256 条的表变大').toBeLessThanOrEqual(8);
    expect(Math.abs(setAtCap - setBeforeCap), '踢除必须 O(1)，不是每次扫全表').toBeLessThanOrEqual(3);
    expect(cache.stats().size).toBe(256);
  });

  it('单 Map 形状门（v672）：命中恰 3 次、写入恰 2 次哈希操作——改回双 Map 会红', () => {
    // 这一条比上面的"常数上界"更紧，专门固化 v672 的结构决策：TtlLru 把 {value,expiresAt}
    // 收进一张 Map，命中从 6 次哈希降到 3（get+delete+set）、写入从 3 降到 2（delete+set）。
    // 若有人无意改回 store/expiry 双表，命中会回到 6、写入回到 3，这里立刻红——顺带守住
    // 那个由结构消掉的"两表始终同键"不变量（旧版 get 里的 expiresAt! 曾靠它）。
    const counter = mapOpCounter();
    // maxEntries 留足余量（1000），让下面的写入**不触发 evictIfNeeded**——否则每次 set 会多一次
    // 淘汰用的 delete（那属踢除成本，上一条门已单独量过），把这个"纯存储形状"的读数从 2 抬到 3。
    const cache = new TtlLru<number, number>({ maxEntries: 1000, defaultTtlMs: 0 });
    for (let i = 0; i < 64; i += 1) cache.set(i, i);

    counter.reset();
    for (let i = 0; i < 64; i += 1) cache.get(i % 64);
    expect(counter.value() / 64, '单 Map 命中应恰为 3 次哈希操作（get + delete + set）').toBe(3);

    counter.reset();
    for (let i = 64; i < 128; i += 1) cache.set(i, i);
    expect(counter.value() / 64, '单 Map 写入应恰为 2 次哈希操作（delete + set）').toBe(2);
  });

  it('源码静态门：TtlLru 只有一张表，不再有独立的 expiry Map', () => {
    const text = readFileSync(join(process.cwd(), 'apps/web/src/server/cache/ttlLru.ts'), 'utf8').replace(/\r\n/g, '\n');
    const newMaps = text.match(/new Map</g) ?? [];
    expect(newMaps.length, '两张 Map 会重新引入"两表同键"的隐式不变量与双份键内存').toBe(1);
    expect(text, '值与过期时刻应绑在同一个 TtlEntry 条目里').toMatch(/Map<K, TtlEntry<V>>/);
    expect(text, '不该再有独立的 expiry 表').not.toMatch(/expiry\s*=\s*new Map/);
  });
});

describe('MemoryRateLimiter 顶到上界后每次只淘汰一只（摊还 O(1) 形状门）', () => {
  it('上界洪水里逐笔 Map 操作数零方差——退化成每次扫全表会随桶数涨', async () => {
    const counter = mapOpCounter();
    // sweepEveryHits 设得很大，隔离掉"每 256 次那趟全表清扫"，让这一门只量上界淘汰那一路。
    const rl = new MemoryRateLimiter({ maxBuckets: 8, sweepEveryHits: 1_000_000 });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      const perHit: number[] = [];
      for (let i = 0; i < 300; i += 1) {
        counter.reset();
        void rl.hit(`gate|visitor-${i}|10.0.0.1`, 1, 600_000); // 无 await：函数体同步跑完
        perHit.push(counter.value());
      }

      // 前 8 笔在填表，之后每笔都淘汰一只。取顶到上界之后的段。
      const atCap = perHit.slice(20);
      expect(new Set(atCap).size, '每一笔洪水命中的成本必须逐笔相等（零方差）').toBe(1);
      expect(atCap[0]!, '摊还 O(1)：每笔有常数上界，不随 8 只桶的表变大').toBeLessThanOrEqual(16);
      expect(atCap[0]!, '顶到上界应当比未到上界多付一笔淘汰的常数成本').toBeGreaterThan(perHit[1]!);
      expect(rl.bucketCount).toBe(8);
    } finally {
      warn.mockRestore();
    }
  });

  it('两档上界（8 / 4096）单笔成本相等——maxBuckets 变大不许让每次淘汰变贵', async () => {
    const counter = mapOpCounter();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      const perHitAtCap: number[] = [];
      for (const maxBuckets of [8, 4096]) {
        const rl = new MemoryRateLimiter({ maxBuckets, sweepEveryHits: 1_000_000 });
        // 先把表填到上界，再量第一笔淘汰。
        for (let i = 0; i < maxBuckets; i += 1) void rl.hit(`gate|fill-${i}|1.1.1.1`, 1, 600_000);
        counter.reset();
        void rl.hit('gate|one-more|2.2.2.2', 1, 600_000);
        perHitAtCap.push(counter.value());
      }
      expect(perHitAtCap[0], `上界 8 与 4096 的单笔淘汰成本必须相等（实测 ${perHitAtCap.join(' vs ')}）`)
        .toBe(perHitAtCap[1]);
      expect(perHitAtCap[0]!, '淘汰一只的代价有常数上界').toBeLessThanOrEqual(16);
    } finally {
      warn.mockRestore();
    }
  });
});
