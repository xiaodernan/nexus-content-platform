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

/**
 * v673 / ADR 0106 立了"单桶扫描有界"的第一道门，手法是包 `Array.prototype.filter` 数回调。
 *
 * **v675 / ADR 0108 把它从"有界 O(limit)"兑现成"摊还 O(1)"，并迁移了判据。** 这是一次刻意的
 * 门升级，原因必须写清（否则像把门改松了）：生产 `hit()` 已把 `hits.filter(t => t > cutoff)`
 * 换成 head 游标越过过期前缀 + 惰性压实。若沿用 v673 的数-filter-回调，改后那个数**恒为 0**，
 * 三句断言（零方差 / ≤limit+32 / 正交）全部假绿——门还在，测的却不再是它声称的成本。这正是
 * ADR 0095 的反面教材：别让门去读一个实现一换就恒 0 的代理量。
 *
 * 所以生产如实报出 `windowVisits`（head 这一笔检查了几个时间戳），门改读它：
 * ① **O(1) 封顶门**：满桶洪水（窗口整段不过期）逐笔增量恒为 1（while 只探一次就 break）。
 *    谁把双指针改回"每笔扫全桶"，这里立刻变成 limit 而红——比 v673 的 ≤limit+32 更紧、更有牙。
 * ② **正交门（换轴）**：v673 钉"与桶数正交"，v675 升到"与 limit 也正交"——limit 8/64/4096
 *    单笔恒为 1。真 O(1) 必须对**两个会长维度**（桶数、limit）都平。
 * ③ **摊还累计门**：N 笔滚动命中（时钟推进、窗口持续滑动）总 visits ≤ 2N + 常数。压实若失效，
 *    hits 无限涨，越过段会把累计 visits 拖成超线性——这条同时钉住"摊还 O(1)"与"内存有上界"，
 *    不必去读内部数组的封装。
 *
 * 三道门都是确定性步数，不读墙钟（共享宿主墙钟只归档，见 PERFORMANCE.md）。同进程交替 A/B
 * 的收益裁决与 24300 格新旧对拍在 `docs/evidence/ds/single-bucket-ab.mjs`。
 * **刻意不钉"每笔必须恰好 1"以外的实现细节**（如压实门槛 32）——那会把换一个同样 O(1) 的
 * 环形缓冲正当优化判红（ADR 0094 X4）；钉的是"每笔常数、与两轴正交、累计线性"这三条性质。
 */
function visitsDelta(rl: MemoryRateLimiter, run: () => void): number {
  const before = rl.windowVisits;
  run();
  return rl.windowVisits - before;
}

describe('MemoryRateLimiter 单桶滑动窗口的摊还 O(1) 契约（v675 / ADR 0108）', () => {
  it('O(1) 封顶门：满桶洪水逐笔 windowVisits 增量恒为 1——改回每笔扫全桶会随 limit 涨而红', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-12T00:00:00Z'));
    try {
      const limit = 64;
      const rl = new MemoryRateLimiter({ maxBuckets: 100, sweepEveryHits: 1_000_000 });
      const key = 'gate|warm|1.1.1.1';
      // 先填满这只桶（每笔都放行、窗口整段不过期）。
      for (let i = 0; i < limit; i += 1) void rl.hit(key, limit, 600_000);
      // 撞上限后 allowed=false、时钟冻结：旧版每笔 filter 扫满 64 条，新版 while 探 1 次即 break。
      const atCap: number[] = [];
      for (let i = 0; i < 100; i += 1) {
        atCap.push(visitsDelta(rl, () => void rl.hit(key, limit, 600_000)));
      }
      expect(new Set(atCap).size, '满桶后逐笔游标检查数必须零方差——逐笔涨就是退化成扫累积段').toBe(1);
      expect(atCap[0], `摊还 O(1)：满桶单笔只探 1 格（实测 ${atCap[0]}），扫全桶会变成 ${limit}`).toBe(1);
      expect(rl.bucketCount).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('正交门：limit 8 / 64 / 4096 满桶单笔 windowVisits 恒为 1——对桶数与 limit 两轴都平', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-12T00:00:00Z'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      const perLimit: number[] = [];
      for (const limit of [8, 64, 4096]) {
        const rl = new MemoryRateLimiter({ maxBuckets: 100, sweepEveryHits: 1_000_000 });
        const key = `gate|target-${limit}|1.1.1.1`;
        for (let i = 0; i < limit; i += 1) void rl.hit(key, limit, 600_000);
        perLimit.push(visitsDelta(rl, () => void rl.hit(key, limit, 600_000)));
      }
      expect(
        new Set(perLimit).size,
        `单桶命中成本必须与 limit 正交（实测 ${perLimit.join(' / ')}）——真 O(1) 对两个会长维度都平`,
      ).toBe(1);
      expect(perLimit[0], `三档 limit 都应只探 1 格（实测 ${perLimit.join(' / ')}）`).toBe(1);
    } finally {
      warn.mockRestore();
      vi.useRealTimers();
    }
  });

  it('摊还累计门：N 笔持续滚动命中总 visits ≤ 2N+O(1)——压实失效让 hits 无限涨会红', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-12T00:00:00Z'));
    try {
      const limit = 16;
      const windowMs = 1_000;
      const rl = new MemoryRateLimiter({ maxBuckets: 100, sweepEveryHits: 1_000_000 });
      const key = 'gate|rolling|1.1.1.1';
      const N = 5_000;
      const before = rl.windowVisits;
      for (let i = 0; i < N; i += 1) {
        // 每笔推进 1ms：窗口只有 1000ms，于是旧条目持续越过、head 持续前进、压实反复触发。
        vi.advanceTimersByTime(1);
        void rl.hit(key, limit, windowMs);
      }
      const total = rl.windowVisits - before;
      // 每笔最坏：1 次 break 探测 + 越过若干过期条目；每一条时间戳一生只被越过一次 ⇒
      // 累计越过 ≤ push 总数 ≤ N，加每笔 1 次探测 ⇒ 上界 2N。压实若失效（废弃段不删），
      // 越过段会反复拖累，累计超线性而红。+limit 吸收 head 未压完的尾段。
      expect(total, `累计 ${total} 应 ≤ 2N+O(1)=${2 * N + limit}；超线性就是摊还承诺破了`).toBeLessThanOrEqual(2 * N + limit);
    } finally {
      vi.useRealTimers();
    }
  });
});
