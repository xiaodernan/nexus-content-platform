/**
 * v675 / ADR 0108：`MemoryRateLimiter` 单桶滑动窗口 O(limit) → 摊还 O(1) 的同进程裁决脚本。
 *
 * 为什么先有这一支、再碰生产源码（共享工作树纪律）：这里把"旧 filter 版"与"新双指针版"
 * **逐字并排内联**，先对拍 correctness（同一注入时钟逐格钉严格相等——判定不许因算法改写变一个字），
 * 再做同进程交替 A/B（9 轮、每轮反转先后抵消 JIT 热身、取 p50 中位数）。cross-process 的
 * before/after 墙钟在 v672 被 +695% 的宿主噪声教过一次（哈希只减半撑不起 8×，同代码连跑 ±40%），
 * 所以这里只信同进程交替 A/B 的比值，绝不把两次独立进程的墙钟差当收益。
 *
 * 两个实现都只模拟 `hit()` 里**单桶窗口**那一段（真正要裁决的常数因子），不含 Map/observability/
 * Promise 分配——那些与 limit 无关的固定开销在两版里一样，混进来只会稀释比值。生产版会把
 * 双指针 + 惰性压实搬进 `rateLimitMemory.ts`，并新增一个 `windowVisits` 诊断计数（while 检查次数），
 * 让"摊还 O(1)"这条声称有可读的数去守它（ADR 0095：别让门读恒 0 的代理量假绿）。
 *
 * 跑法：`node docs/evidence/ds/single-bucket-ab.mjs`。exit 0 = correctness 逐格相等 + A/B 跑完。
 */

/** 确定性伪随机（mulberry32）：种子固定 ⇒ 对拍可复现，不用 Math.random 污染证据。 */
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * 旧版（v673 及以前的生产形状）：每笔 filter 扫满整只桶，成本 O(桶内时间戳数) ≤ O(limit)。
 * 关键：filter 结果写回 hits——过期元素每轮被丢弃（所以它是"丢弃式"，不是"完整历史重筛"）。
 */
class FilterWindow {
  constructor() {
    this.hits = [];
    // 故意不放任何探针计数：生产旧版每笔就是一次纯 filter，A/B 必须忠实于那个形状。
    // v671 的教训：给被测操作逐次插计数/计时，计数本身就成了成本，比值会被虚高放大。
  }

  hit(limit, windowMs, now) {
    const cutoff = now - windowMs;
    const window = this.hits.filter((t) => t > cutoff);
    const allowed = window.length < limit;
    if (allowed) window.push(now);
    this.hits = window; // 写回：过期元素丢弃
    const oldest = window[0] ?? now;
    return {
      allowed,
      count: window.length,
      retryAfterMs: allowed ? 0 : Math.max(0, oldest + windowMs - now),
      newest: window[window.length - 1] ?? 0, // 供 sweepExpired 判整桶过期
    };
  }
}

/**
 * 新版（v675）：head 游标越过过期元素 + 惰性压实。
 * - while 每个元素一生只被越过一次（压实后 slice 掉），摊还 O(1)/命中；
 * - hits.length ≤ 2×limit + 常数（压实门槛 head×2 ≥ length 保证有效段至少占一半）；
 * - 压实只砍头部、不动尾，所以 newest（sweep 用）与旧版逐格相同。
 */
const COMPACT_MIN = 32;

class CursorWindow {
  constructor() {
    this.hits = [];
    this.head = 0;
    this.visits = 0; // while 检查次数（= 生产 windowVisits 诊断字段的语义）
  }

  hit(limit, windowMs, now) {
    const cutoff = now - windowMs;
    // 越过所有 t <= cutoff（严格留下 t > cutoff）——每条最多越过一次
    while (this.head < this.hits.length) {
      this.visits += 1;
      if (this.hits[this.head] <= cutoff) this.head += 1;
      else break;
    }
    let count = this.hits.length - this.head;
    const allowed = count < limit;
    if (allowed) {
      this.hits.push(now);
      count += 1;
    }
    // 惰性压实：head 过半且够大时把有效段挪到头，避免数组无限长 + 让 while 不重复扫废弃段
    if (this.head >= COMPACT_MIN && this.head * 2 >= this.hits.length) {
      this.hits = this.hits.slice(this.head);
      this.head = 0;
    }
    const oldest = this.hits[this.head] ?? now;
    return {
      allowed,
      count,
      retryAfterMs: allowed ? 0 : Math.max(0, oldest + windowMs - now),
      newest: this.hits[this.hits.length - 1] ?? 0,
    };
  }
}

/** 逐格对拍：同一注入时钟序列，两版三件判定 + newest 必须严格相等。 */
function checkCorrectness() {
  const scenarios = [
    { limit: 1, windowMs: 1000, steps: 400, dt: 37 },
    { limit: 3, windowMs: 1000, steps: 600, dt: 91 },
    { limit: 8, windowMs: 500, steps: 900, dt: 53 },
    { limit: 64, windowMs: 60_000, steps: 1200, dt: 17 },
    // 大 dt 让窗口频繁整段滑空，专压 head 越界 + 压实那条路径
    { limit: 16, windowMs: 100, steps: 900, dt: 220 },
    // 极端 limit 边界
    { limit: 1, windowMs: 1, steps: 300, dt: 0 },
  ];
  let checked = 0;
  for (const [si, sc] of scenarios.entries()) {
    const oldW = new FilterWindow();
    const newW = new CursorWindow();
    let now = 1_700_000_000_000;
    const rand = rng(0x5eed + si);
    for (let i = 0; i < sc.steps; i += 1) {
      now += sc.dt + Math.floor(rand() * 3) - 1;
      const a = oldW.hit(sc.limit, sc.windowMs, now);
      const b = newW.hit(sc.limit, sc.windowMs, now);
      for (const field of ['allowed', 'count', 'retryAfterMs', 'newest']) {
        if (a[field] !== b[field]) {
          process.stderr.write(
            `CORRECTNESS FAIL scenario=${si} step=${i} field=${field} old=${a[field]} new=${b[field]}\n`,
          );
          process.exitCode = 1;
          return;
        }
      }
      checked += 1;
    }
    // 压实确实发生过：有效段仍被 limit 封顶，且数组没有无限长
    const live = newW.hits.length - newW.head;
    if (live > sc.limit) {
      process.stderr.write(`CORRECTNESS FAIL scenario=${si}: live=${live} > limit=${sc.limit}\n`);
      process.exitCode = 1;
      return;
    }
  }
  // 抖动对拍：同一只桶的 limit / windowMs 逐笔变化，专压 head 游标单调性。
  // 表面担心：窗口变大（cutoff 变小）时被 head 越过的元素该不该"复活"。
  // 原版是写回式丢弃（hits = filter 结果），越过即删；新版 head 越过 + 惰性压实也是丢弃式。
  // 两版应逐格相等——但这是语义推断，必须用抖动时钟实测，不能靠想。
  let jitterChecked = 0;
  for (let si = 0; si < 40; si += 1) {
    const oldW = new FilterWindow();
    const newW = new CursorWindow();
    let now = 1_700_000_000_000;
    const rand = rng(0xb00b + si);
    for (let i = 0; i < 500; i += 1) {
      now += Math.floor(rand() * 400);
      const limit = 1 + Math.floor(rand() * 24); // 逐笔在 1..24 之间抖
      const windowMs = 200 + Math.floor(rand() * 4000); // 逐笔在 200..4200 之间抖
      const a = oldW.hit(limit, windowMs, now);
      const b = newW.hit(limit, windowMs, now);
      for (const field of ['allowed', 'count', 'retryAfterMs', 'newest']) {
        if (a[field] !== b[field]) {
          process.stderr.write(
            `JITTER FAIL scenario=${si} step=${i} limit=${limit} windowMs=${windowMs} ` +
              `field=${field} old=${a[field]} new=${b[field]}\n`,
          );
          process.exitCode = 1;
          return;
        }
      }
      jitterChecked += 1;
    }
  }
  process.stdout.write(
    `  correctness: ${checked} 格逐字段严格相等 + ${jitterChecked} 格抖动边界（limit/windowMs 逐笔变）严格相等\n`,
  );
}

/** 分批计时：每 CHUNK 命中量一段 p50，避免逐操作 performance.now() 与被测操作同量级污染读数。 */
const CHUNK = 512;
function bench(makeWindow, ops, limit, windowMs, dt) {
  const w = makeWindow();
  let now = 1_700_000_000_000;
  const perOpUs = [];
  let done = 0;
  while (done < ops) {
    const n = Math.min(CHUNK, ops - done);
    const t0 = performance.now();
    for (let j = 0; j < n; j += 1) {
      now += dt;
      w.hit(limit, windowMs, now);
    }
    const t1 = performance.now();
    perOpUs.push(((t1 - t0) / n) * 1000);
    done += n;
  }
  perOpUs.sort((a, b) => a - b);
  return perOpUs[Math.floor(perOpUs.length * 0.5)];
}

/**
 * 同进程交替 A/B：9 轮，每轮内 old/new 成对且反转先后抵消 JIT 热身偏置，各轮 p50 比值取中位数。
 * 场景 = 满桶洪水（allowed=false 每笔都付满旧 filter 的 O(limit)，正是页眉最在意的"最贵时刻"）。
 */
function ab() {
  const limit = 64;
  const windowMs = 60_000; // 整段不过期 ⇒ 旧版每笔恒扫 64 条
  const dt = 1;
  const ops = 40_000;
  const rounds = 9;
  const ratios = [];
  for (let r = 0; r < rounds; r += 1) {
    let oldUs;
    let newUs;
    if (r % 2 === 0) {
      oldUs = bench(() => new FilterWindow(), ops, limit, windowMs, dt);
      newUs = bench(() => new CursorWindow(), ops, limit, windowMs, dt);
    } else {
      newUs = bench(() => new CursorWindow(), ops, limit, windowMs, dt);
      oldUs = bench(() => new FilterWindow(), ops, limit, windowMs, dt);
    }
    ratios.push(oldUs / newUs);
  }
  ratios.sort((a, b) => a - b);
  const median = ratios[Math.floor(ratios.length / 2)];
  process.stdout.write(
    `  A/B (flood, limit=${limit}, ops=${ops}, ${rounds} rounds interleaved): old/new p50 ratio median = ${median.toFixed(2)}×\n` +
      `    per-round ratios (sorted): ${ratios.map((x) => x.toFixed(2)).join(', ')}\n`,
  );
  process.stdout.write('    NOTE: cross-process wall-clock is host noise; this interleaved in-process A/B is the verdict.\n');
}

process.stdout.write('=== v675 single-bucket O(1) — correctness + in-process A/B ===\n');
checkCorrectness();
if (!process.exitCode) ab();
process.stdout.write(`=== done (exit ${process.exitCode ?? 0}) ===\n`);
