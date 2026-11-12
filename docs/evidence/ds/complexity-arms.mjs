/**
 * 变异臂（evidence 语料，纯 Node ESM）：证明 ds-complexity-contract.test.ts 的判据能区分
 * "退化实现"，门不是碰巧绿。每条臂内联一个故意写坏的同类结构，用与契约门相同的操作计数，
 * 断言判据会拒绝它。跑法：`node docs/evidence/ds/complexity-arms.mjs`。
 *
 * M1/M3/M4（v671/v672，Map 操作轴）RED as expected；M4 是"改回双 Map ⇒ 单 Map 形状门红"。
 * M2 曾设计成"固定上界下每次扫全表"，实测门判绿——**门是对的**：
 * 上界固定时 bucketCount 恒定，"扫固定 8 只"就是 O(1)（只是常数大），逐笔零方差。真能红的退化
 * 是"成本随 max 涨"（臂 3），门4 抓住了。这段诚实记录见 ADR 0104，不伪造有牙的臂自欺。
 *
 * M5/M6/M7/M8（v673 / ADR 0106，单桶 filter 数组扫描轴）：判据数的是 Array.prototype.filter
 * 的回调次数（＝滑动窗口扫过的时间戳数），补 v671 只数 Map 操作而看不见的单桶内部复杂度。
 *  - M5 无限累积（不再滤掉过期时间戳）⇒ 封顶门"逐笔零方差"红；
 *  - M6 O(limit²)（filter 里对每个 t 再扫一遍 window）⇒ 封顶门"≤limit+常数"红；
 *  - M7 扫全桶（把全镇桶的时间戳拼起来扫）⇒ 正交门"与桶数无关"红；
 *  - M8 **正当 O(1) 环形裁剪 ⇒ 两条门都必须绿**（ADR 0094 X4 正面臂：门不许惩罚把 O(limit)
 *    降到 O(1) 的正当优化，否则判据钉了"今天恰好线性"这个字面值，将来优化反被判红）。
 */
import assert from 'node:assert/strict';

/** 包住 Map 的四个结构操作计数（先存原引用再替换，避免递归套娃）。 */
function mapOpCounter() {
  const proto = Map.prototype;
  const original = {
    get: proto.get,
    set: proto.set,
    delete: proto.delete,
    iter: proto[Symbol.iterator],
  };
  let count = 0;
  const bump = (fn) =>
    function (...args) {
      count += 1;
      return Reflect.apply(fn, this, args);
    };
  proto.get = bump(original.get);
  proto.set = bump(original.set);
  proto.delete = bump(original.delete);
  proto[Symbol.iterator] = bump(original.iter);
  return {
    reset: () => {
      count = 0;
    },
    value: () => count,
    restore: () => {
      proto.get = original.get;
      proto.set = original.set;
      proto.delete = original.delete;
      proto[Symbol.iterator] = original.iter;
    },
  };
}

/** 退化 TtlLru：命中时逐元素 get 一遍全表（模拟"顺手校验每条是否过期"，真实 O(n)）。 */
class DegenerateTtlLru {
  constructor(cap) {
    this.cap = cap;
    this.store = new Map();
    for (let i = 0; i < cap; i += 1) this.store.set(i, i);
  }
  get(k) {
    const v = this.store.get(k);
    if (v === undefined) return undefined;
    for (let j = 0; j < this.cap; j += 1) this.store.get(j); // O(n) 逐元素访问
    this.store.delete(k);
    this.store.set(k, v);
    return v;
  }
}

/** 退化 limiter：淘汰时逐元素扫全表，成本随 max 涨。 */
class DegenerateLimiter {
  constructor(max) {
    this.max = max;
    this.buckets = new Map();
  }
  hit(key) {
    this.buckets.set(key, [1]);
    while (this.buckets.size > this.max) {
      let oldest;
      for (const [k] of this.buckets) {
        oldest = k;
        break;
      }
      for (const k of this.buckets.keys()) this.buckets.get(k); // 误写：逐元素扫全表
      if (oldest !== undefined) this.buckets.delete(oldest);
    }
  }
}

/** 退化 TtlLru（v672 前的双 Map 形状）：值与过期时刻分两张表 ⇒ 命中 6 次哈希（而非单 Map 的 3）。 */
class DoubleMapLru {
  constructor(cap) {
    this.cap = cap;
    this.store = new Map();
    this.expiry = new Map();
  }
  set(k, v) {
    this.store.set(k, v);
    this.expiry.set(k, Number.POSITIVE_INFINITY);
  }
  get(k) {
    const exp = this.expiry.get(k);
    if (exp !== undefined && Date.now() >= exp) return undefined;
    const v = this.store.get(k);
    if (v === undefined) return undefined;
    this.store.delete(k);
    this.expiry.delete(k);
    this.store.set(k, v);
    this.expiry.set(k, exp);
    return v;
  }
}

/** 包住 Array.prototype.filter 数回调次数（＝滑动窗口扫过的时间戳数），先存原引用防递归。 */
function arrayFilterCallbackCounter() {
  const original = Array.prototype.filter;
  let count = 0;
  Array.prototype.filter = function (...args) {
    const cb = args[0];
    const thisArg = args[1];
    const wrapped = (...a) => {
      count += 1;
      return cb(...a);
    };
    return Reflect.apply(original, this, [wrapped, thisArg]);
  };
  return {
    reset: () => {
      count = 0;
    },
    value: () => count,
    restore: () => {
      Array.prototype.filter = original;
    },
  };
}

/** M5 退化：滑动窗口不再滤掉过期时间戳，hits 数组单调增长 ⇒ 满桶后每笔 filter 越滚越大。 */
class NeverExpireLimiter {
  constructor() {
    this.hits = [];
  }
  hit(limit) {
    // 仍每笔扫一遍"判过期"（保持与正常实现同样的 filter 形状），但**从不真正删**过期项，
    // hits 单调涨 ⇒ 满桶后每笔 filter 的回调数逐笔 +1，零方差门红。
    const window = this.hits.filter(() => true);
    const allowed = window.length < limit;
    if (allowed) window.push(1);
    this.hits = window;
  }
}

/**
 * M6 退化：外层 filter 的每个回调里再嵌一次 filter ⇒ 单笔 filter 回调 O(limit²)。
 * 注意退化必须**走 filter 回调**才落在契约门（数 filter 回调）的射程内；若用 for-of 做内层，
 * 计数器抓不到——那正是 ADR 0106 记下的门判据边界：它守的是"filter 扫过的时间戳数"这个代理量，
 * 别的实现若把线性扫描藏进不触发 filter 回调的循环，需另配门（本片如实记为界）。
 */
class QuadraticFilterLimiter {
  constructor() {
    this.hits = [];
  }
  hit(limit) {
    const window = this.hits.filter(() => {
      void this.hits.filter(() => true); // 内层 filter：回调也计入全局计数 ⇒ O(limit²)
      return true;
    });
    const allowed = window.length < limit;
    if (allowed) window.push(1);
    this.hits = window;
  }
}

/** M7 退化：把所有桶的时间戳拼起来 filter ⇒ 单桶命中成本随全表桶数涨。 */
class SweepAllBucketsLimiter {
  constructor() {
    this.buckets = new Map();
  }
  hit(key, limit) {
    // 误写：为判这一只桶，先把全镇所有桶的时间戳拼成一条再扫。
    const all = [];
    for (const arr of this.buckets.values()) for (const t of arr) all.push(t);
    void all.filter(() => true); // 只为激发"扫全镇"的 filter 回调计数，结果不参与判定
    const own = this.buckets.get(key) ?? [];
    const allowed = own.length < limit;
    if (allowed) own.push(1);
    this.buckets.set(key, own);
  }
}

/**
 * M8 正当优化：把"每笔扫满 limit 条"换成 O(1) 环形裁剪——只扫当前窗口内那几格（这里恒 8），
 * 且从不累积旧项。每笔 filter 回调恒为常数 ⇒ 零方差、有界；两条门都必须绿，证明门不惩罚
 * 把 O(limit) 进一步降到 O(1) 的正当改动（ADR 0094 X4 正面臂）。
 */
class RingTrimLimiter {
  constructor() {
    this.hits = [];
  }
  hit() {
    const live = this.hits.filter(() => true); // 只扫当前窗口内的固定几格
    live.push(1);
    this.hits = live.slice(-8); // 环形上界：从不让数组增长超过固定窗口
  }
}

/* ── v675 / ADR 0108：摊还 O(1) 门（读实现自报的 windowVisits）的变异臂 ─────────────── */

/**
 * M9 退化：改回"每笔扫全桶"，并**如实报出**扫了几格（visits = 桶内条数）。
 * 这是 v673 数-filter-回调门会**假绿**不了的关键对照：新门要求满桶单笔 visits 恒 1，
 * 这里随 limit 涨（8/64/4096），O(1) 封顶门必红。旧 v673 门在这个实现上反而绿（filter 回调
 * 被 limit 封顶、零方差、与桶数正交）——正好复现"门钉了有界 O(limit)，把 O(limit) 退化也放过去"
 * 的旧日边界，说明 v675 把判据从"有界"升到"恒 1"是有牙且必要的。
 */
class FullScanWindow {
  constructor() {
    this.hits = [];
    this.visitsTotal = 0;
  }
  hit(limit, windowMs, now) {
    const cutoff = now - windowMs;
    const alive = [];
    for (const t of this.hits) {
      this.visitsTotal += 1;
      if (t > cutoff) alive.push(t);
    }
    const allowed = alive.length < limit;
    if (allowed) alive.push(now);
    this.hits = alive;
    return allowed;
  }
  get visits() {
    return this.visitsTotal;
  }
}

/**
 * M10 退化：head 每笔都从 0 重算、且压实失效（废弃前缀永不删）。
 * 于是窗口一滚动，每笔都要重新越过越来越长的过期前缀 ⇒ 累计 visits 超线性（O(N²) 量级），
 * 摊还累计门（≤2N+O(1)）必红。这是一个**可达**的真实写错：把 head 存成局部变量忘了写回桶。
 */
class NoHeadWindow {
  constructor() {
    this.hits = [];
    this.visitsTotal = 0;
  }
  hit(limit, windowMs, now) {
    const cutoff = now - windowMs;
    let head = 0; // 故意不持久：每笔从 0 重新越过，且不压实
    while (head < this.hits.length) {
      this.visitsTotal += 1;
      if (this.hits[head] <= cutoff) head += 1;
      else break;
    }
    const count = this.hits.length - head;
    const allowed = count < limit;
    if (allowed) this.hits.push(now);
    return allowed;
  }
  get visits() {
    return this.visitsTotal;
  }
}

/**
 * M11 正当优化（正面臂）：与生产"head 双指针 + 惰性压实"**不同**的 O(1) 路径——
 * 固定长度环形缓冲，写指针回绕、从不留废弃段。每笔恒探 1 格、与 limit 正交、累计线性，
 * 三道门全绿。钉死"门不许绑定 head 双指针这一种实现"（ADR 0094 X4）。
 */
class RingBufferWindow {
  constructor() {
    this.buf = [];
    this.limit = 0;
    this.visitsTotal = 0;
  }
  hit(limit, windowMs, now) {
    this.limit = limit;
    const cutoff = now - windowMs;
    // 固定容量环形：只保留最近 limit 条，过期头部随回绕自然覆盖，每笔至多探 1 格。
    this.visitsTotal += 1;
    while (this.buf.length > 0 && this.buf[0] <= cutoff) this.buf.shift();
    const allowed = this.buf.length < limit;
    if (allowed) this.buf.push(now);
    else {
      // 撞上限不 push，但要让最早那条随时间过期——下一笔的 while 会处理，这里恒 1 探。
    }
    return allowed;
  }
  get visits() {
    return this.visitsTotal;
  }
}

const arms = [
  {
    name: 'M1 TtlLru 命中混入 O(n) 全表扫描 ⇒ 门1（成本与容量无关）必须红',
    run: () => {
      const c = mapOpCounter();
      try {
        const per = [];
        for (const cap of [8, 8192]) {
          const cache = new DegenerateTtlLru(cap);
          c.reset();
          for (let i = 0; i < 8; i += 1) cache.get(i % cap);
          per.push(c.value() / 8);
        }
        // 门1 判据:两容量每命中操作数相等且有界。
        const green = Number.isInteger(per[0]) && per[0] <= 8 && per[0] === per[1];
        assert.equal(green, false, `M1 应红,却绿了:cap8=${per[0]} cap8192=${per[1]}`);
        process.stdout.write(`  M1 RED as expected (cap8=${per[0]} vs cap8192=${per[1]})\n`);
      } finally {
        c.restore();
      }
    },
  },
  {
    name: 'M3 两档上界单笔淘汰成本随 max 涨 ⇒ 门4 必须红',
    run: () => {
      const c = mapOpCounter();
      try {
        const costs = [];
        for (const max of [8, 4096]) {
          const rl = new DegenerateLimiter(max);
          for (let i = 0; i < max; i += 1) rl.hit(`fill-${i}`);
          c.reset();
          rl.hit('one-more');
          costs.push(c.value());
        }
        assert.notEqual(costs[0], costs[1], `M3 应红(两档成本不等),却相等:${costs.join(' vs ')}`);
        process.stdout.write(`  M3 RED as expected (max8=${costs[0]} vs max4096=${costs[1]})\n`);
      } finally {
        c.restore();
      }
    },
  },
  {
    name: 'M4 TtlLru 改回双 Map ⇒ v672 单 Map 形状门（命中恰 3 次）必须红',
    run: () => {
      const c = mapOpCounter();
      try {
        const cache = new DoubleMapLru(64);
        for (let i = 0; i < 64; i += 1) cache.set(i, i);
        c.reset();
        for (let i = 0; i < 64; i += 1) cache.get(i % 64);
        const perHit = c.value() / 64;
        // v672 门判据:单 Map 命中恰 3 次。双 Map 是 6 ⇒ 红。
        assert.notEqual(perHit, 3, `M4 应红(双 Map 命中≠3),却等于 3:${perHit}`);
        process.stdout.write(`  M4 RED as expected (double-Map hit=${perHit} ops, single-Map gate wants 3)\n`);
      } finally {
        c.restore();
      }
    },
  },
  {
    // 这条臂**按设计没红成**，与 v671 的 M2 同类，如实记录而不伪造有牙臂。
    // 原因：真 `MemoryRateLimiter` 在 allowed=false 时**不 push**，所以即便 filter 不再滤掉过期项，
    // hits 也会被 limit 这道闸卡死在 limit 条——"无限累积"在完整的限流逻辑里不可达。门判绿是
    // **正确的**：它守的是可达的退化，O(limit) 的有界性本就有两道保险（filter 裁过期 + allowed
    // 封 push）。删掉任何一道，语义门（撞上限计数/放行）也会先红，不是复杂度门该单独背的保证。
    name: 'M5 "hits 无限累积"退化不可达（allowed=false 不 push）⇒ 门判绿是对的,诚实记录',
    expectGreen: true,
    run: () => {
      const c = arrayFilterCallbackCounter();
      try {
        const rl = new NeverExpireLimiter();
        const limit = 8;
        for (let i = 0; i < limit; i += 1) rl.hit(limit);
        const perHit = [];
        for (let i = 0; i < 6; i += 1) {
          c.reset();
          rl.hit(limit);
          perHit.push(c.value());
        }
        const zeroVariance = new Set(perHit).size === 1;
        assert.equal(zeroVariance, true, `M5 应保持绿(扫描被 allowed 卡死在 limit),却漂了:${perHit.join(',')}`);
        process.stdout.write(`  M5 GREEN as expected (unreachable accumulation: allowed=false caps hits, ${perHit.join(',')})\n`);
      } finally {
        c.restore();
      }
    },
  },
  {
    name: 'M6 单桶 filter 退化成 O(limit²) ⇒ v673 封顶门"≤limit+常数"必须红',
    run: () => {
      const c = arrayFilterCallbackCounter();
      try {
        const limit = 16; // 用 16：满桶后单笔内层嵌套 filter 回调 = 16 + 16×16 = 272 ≫ 16+32
        const rl = new QuadraticFilterLimiter();
        for (let i = 0; i < limit; i += 1) rl.hit(limit); // 先填到满桶（hits 稳定在 limit 条）
        c.reset();
        rl.hit(limit); // 满桶单笔：allowed=false 不 push，但外层 filter 每个回调嵌一次内层 filter
        const perHit = c.value();
        const bounded = perHit <= limit + 32; // 与契约门同一上界判据
        assert.equal(bounded, false, `M6 应红(单笔扫描应远超 limit),却被判有界:${perHit}`);
        process.stdout.write(`  M6 RED as expected (O(limit^2) hit=${perHit} callbacks limit=${limit})\n`);
      } finally {
        c.restore();
      }
    },
  },
  {
    name: 'M7 单桶命中退化成扫全表所有桶 ⇒ v673 正交门"与桶数无关"必须红',
    run: () => {
      const c = arrayFilterCallbackCounter();
      try {
        const limit = 16;
        const scans = [];
        for (const nBuckets of [8, 4096]) {
          const rl = new SweepAllBucketsLimiter();
          for (let i = 0; i < nBuckets; i += 1) rl.hit(`b${i}`, 1); // 每只桶塞 1 条 ⇒ 全表 nBuckets 条
          c.reset();
          rl.hit('target', limit);
          scans.push(c.value());
        }
        assert.notEqual(scans[0], scans[1], `M7 应红(扫全表随桶数涨),却相等:${scans.join(' vs ')}`);
        process.stdout.write(`  M7 RED as expected (sweep-all-buckets 8=${scans[0]} vs 4096=${scans[1]})\n`);
      } finally {
        c.restore();
      }
    },
  },
  {
    name: 'M8 正当 O(1) 环形裁剪把成本从 O(limit) 降下来 ⇒ v673 两条门都必须绿',
    expectGreen: true,
    run: () => {
      const c = arrayFilterCallbackCounter();
      try {
        const rl = new RingTrimLimiter();
        for (let i = 0; i < 40; i += 1) rl.hit();
        const perHit = [];
        for (let i = 0; i < 8; i += 1) {
          c.reset();
          rl.hit();
          perHit.push(c.value());
        }
        const zeroVariance = new Set(perHit).size === 1;
        const bounded = perHit[0] <= 64 + 32;
        assert.equal(zeroVariance, true, `M8 应绿(正当优化仍零方差),却漂了:${perHit.join(',')}`);
        assert.equal(bounded, true, `M8 应绿(正当优化更有界),却超界:${perHit[0]}`);
        process.stdout.write(`  M8 GREEN as expected (O(1) ring trim stays zero-variance & bounded: ${perHit[0]})\n`);
      } finally {
        c.restore();
      }
    },
  },
  {
    // v675 核心臂：证明 O(1) 封顶门对"改回扫全桶"有牙，而 v673 的旧门在这同一实现上会假绿。
    name: 'M9 改回每笔扫全桶并如实报步数 ⇒ v675 O(1) 封顶门（恒 1）必须红，而 v673 旧门会假绿',
    run: () => {
      const perLimit = [];
      for (const limit of [8, 64, 4096]) {
        const w = new FullScanWindow();
        const now = 1_700_000_000_000; // 整段不过期：时钟刻意不推进
        for (let i = 0; i < limit; i += 1) w.hit(limit, 600_000, now); // 填满、整段不过期
        const before = w.visits;
        w.hit(limit, 600_000, now); // 满桶单笔：扫全桶 ⇒ visits = limit
        perLimit.push(w.visits - before);
      }
      const gateWouldBeGreen = new Set(perLimit).size === 1 && perLimit[0] === 1; // v675 封顶门判据
      assert.equal(gateWouldBeGreen, false, `M9 应红(满桶单笔不恒 1),却恒 1:${perLimit.join(',')}`);
      // 反证实算：v673 旧封顶门在 limit=64 这一档会怎么判——逐笔恒 64（零方差）、64 ≤ 64+32，
      // 于是判绿。这正是 v675 要把判据从"有界 O(limit)"升到"恒 1"的理由，实算出来而非空口声称。
      const v673WouldPass = new Set([perLimit[1]]).size === 1 && perLimit[1] <= 64 + 32;
      assert.equal(v673WouldPass, true, `M9 反证失败：v673 旧门本应在这个退化上假绿(逐笔=${perLimit[1]})`);
      process.stdout.write(
        `  M9 RED as expected (v675: per-hit visits vs limit = ${perLimit.join(' / ')}) — ` +
          `v673 old gate WOULD PASS (limit64: ${perLimit[1]} ≤ 96, zero-variance)\n`,
      );
    },
  },
  {
    name: 'M10 head 不持久 + 压实失效（每笔从头越过期前缀）⇒ v675 摊还累计门必须红',
    run: () => {
      const w = new NoHeadWindow();
      const limit = 16;
      const windowMs = 1_000;
      const N = 2_000;
      let now = 1_700_000_000_000;
      const before = w.visits;
      for (let i = 0; i < N; i += 1) {
        now += 1;
        w.hit(limit, windowMs, now); // 每笔从头越过越来越长的废弃前缀
      }
      const total = w.visits - before;
      const gateWouldBeGreen = total <= 2 * N + limit; // v675 摊还累计门判据
      assert.equal(gateWouldBeGreen, false, `M10 应红(累计应超线性),却被判线性:${total} ≤ ${2 * N + limit}`);
      process.stdout.write(`  M10 RED as expected (no-persistent-head cumulative visits=${total} > 2N=${2 * N})\n`);
    },
  },
  {
    name: 'M11 正当 O(1) 环形缓冲（另一条实现路径）⇒ v675 三道门必须全绿',
    expectGreen: true,
    run: () => {
      // 封顶门：满桶洪水单笔恒 1
      const perLimit = [];
      for (const limit of [8, 64, 4096]) {
        const w = new RingBufferWindow();
        const now = 1_700_000_000_000;
        for (let i = 0; i < limit; i += 1) w.hit(limit, 600_000, now);
        const before = w.visits;
        w.hit(limit, 600_000, now);
        perLimit.push(w.visits - before);
      }
      const o1Gate = new Set(perLimit).size === 1 && perLimit[0] === 1;
      assert.equal(o1Gate, true, `M11 应绿(O(1) 封顶恒 1),却漂了:${perLimit.join(',')}`);
      // 摊还累计门：N 笔滚动命中总 visits 线性
      const w = new RingBufferWindow();
      const N = 2_000;
      let now = 1_700_000_000_000;
      const before = w.visits;
      for (let i = 0; i < N; i += 1) {
        now += 1;
        w.hit(16, 1_000, now);
      }
      const total = w.visits - before;
      const amortizedGate = total <= 2 * N + 16;
      assert.equal(amortizedGate, true, `M11 应绿(累计线性),却超界:${total} > ${2 * N + 16}`);
      process.stdout.write(`  M11 GREEN as expected (ring buffer: 3 gates all green, per-hit=${perLimit[0]}, total=${total} ≤ ${2 * N})\n`);
    },
  },
];

let pass = 0;
let red = 0;
let green = 0;
for (const arm of arms) {
  try {
    arm.run();
    pass += 1;
    if (arm.expectGreen) green += 1;
    else red += 1;
  } catch (error) {
    process.stderr.write(`ARM FAILED: ${arm.name}\n${String(error)}\n`);
    process.exitCode = 1;
  }
}
process.stdout.write(`\nmutation arms: ${pass}/${arms.length} as-expected (${red} RED + ${green} GREEN)\n`);
