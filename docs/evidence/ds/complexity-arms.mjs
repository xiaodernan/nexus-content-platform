/**
 * 变异臂（evidence 语料，纯 Node ESM）：证明 ds-complexity-contract.test.ts 的判据能区分
 * "退化实现"，门不是碰巧绿。三条臂都内联一个故意写坏的同类结构，用与契约门相同的 Map 计数，
 * 断言判据会拒绝它。跑法：`node docs/evidence/ds/complexity-arms.mjs`。
 *
 * 臂 M1/M3/M4 RED as expected；M4 是 v672 新增的"改回双 Map ⇒ 单 Map 形状门红"。
 * 臂 M2 曾设计成"固定上界下每次扫全表"，实测门判绿——**门是对的**：
 * 上界固定时 bucketCount 恒定，"扫固定 8 只"就是 O(1)（只是常数大），逐笔零方差。真能红的退化
 * 是"成本随 max 涨"（臂 3），门4 抓住了。这段诚实记录见 ADR 0103，不伪造有牙的臂自欺。
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
];

let pass = 0;
for (const arm of arms) {
  try {
    arm.run();
    pass += 1;
  } catch (error) {
    process.stderr.write(`ARM FAILED: ${arm.name}\n${String(error)}\n`);
    process.exitCode = 1;
  }
}
process.stdout.write(`\nmutation arms: ${pass}/${arms.length} red-as-expected\n`);
