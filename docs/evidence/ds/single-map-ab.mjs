/**
 * v672 A/B：同一进程、交替多轮，对照「双 Map（旧）」与「单 Map（新）」TtlLru 的命中/写入成本。
 *
 * 为什么需要它而不是直接比两次 `ds-benchmark.mts`：那支脚本跨进程跑，宿主在并行 lane / GC / JIT
 * 预热之间漂移极大（同一份单 Map 代码连跑 3 次 ops/s 1.69M~2.88M，±40%）。把两个实现放进同一
 * 进程、**交替**跑，才能让宿主负载对两者一视同仁；判据取每轮 p50（块内每操作均值中位数）的
 * 中位数，不取被长尾污染的 ops/s。
 *
 * 两个实现都是**逐字对应**的：双 Map 版就是 v671 时代的 ttlLru.ts，单 Map 版就是 v672 的；
 * 唯一差别是存储形状。跑法：`node docs/evidence/ds/single-map-ab.mjs`。
 */
import { performance } from 'node:perf_hooks';

const OPS = 300_000;
const CHUNK = 512;
const ROUNDS = 9;

class DoubleMapLru {
  constructor(cap) {
    this.store = new Map();
    this.expiry = new Map();
    this.cap = cap;
  }
  set(k, v, now) {
    this.store.delete(k);
    this.store.set(k, v);
    this.expiry.set(k, now + 100_000); // 永不过期区，隔离 TTL 判定，只量 LRU/哈希
    while (this.store.size > this.cap) {
      const oldest = this.store.keys().next().value;
      this.store.delete(oldest);
      this.expiry.delete(oldest);
    }
  }
  get(k) {
    const exp = this.expiry.get(k);
    if (exp !== undefined && performance.now() >= exp) {
      this.store.delete(k);
      this.expiry.delete(k);
      return undefined;
    }
    const v = this.store.get(k);
    if (v === undefined) return undefined;
    this.store.delete(k);
    this.expiry.delete(k);
    this.store.set(k, v);
    this.expiry.set(k, exp);
    return v;
  }
}

class SingleMapLru {
  constructor(cap) {
    this.store = new Map();
    this.cap = cap;
  }
  set(k, v, now) {
    this.store.delete(k);
    this.store.set(k, { value: v, expiresAt: now + 100_000 });
    while (this.store.size > this.cap) this.store.delete(this.store.keys().next().value);
  }
  get(k) {
    const entry = this.store.get(k);
    if (entry === undefined) return undefined;
    if (performance.now() >= entry.expiresAt) {
      this.store.delete(k);
      return undefined;
    }
    this.store.delete(k);
    this.store.set(k, entry);
    return entry.value;
  }
}

/** 分块计时，返回每操作均值（每块 512 ops），取 p50 中位数；避开逐操作计时器污染。 */
function measure(makeLru, kind, cap) {
  const cache = new makeLru(cap);
  for (let i = 0; i < cap; i += 1) cache.set(i, i, performance.now());
  const perOp = [];
  let done = 0;
  while (done < OPS) {
    const n = Math.min(CHUNK, OPS - done);
    const a = performance.now();
    if (kind === 'hit') {
      for (let j = 0; j < n; j += 1) cache.get((done + j) % cap);
    } else {
      for (let j = 0; j < n; j += 1) cache.set(done + j, done + j, performance.now());
    }
    const b = performance.now();
    perOp.push((b - a) / n);
    done += n;
  }
  perOp.sort((x, y) => x - y);
  return perOp[Math.floor(perOp.length * 0.5)] * 1000; // us/op
}

const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];

for (const kind of ['hit', 'set']) {
  for (const cap of [8, 8192]) {
    const oldNs = [];
    const newNs = [];
    for (let r = 0; r < ROUNDS; r += 1) {
      // 交替顺序，第 r 轮反转先后，抵消单向的 JIT/热身偏置。
      if (r % 2 === 0) {
        oldNs.push(measure(DoubleMapLru, kind, cap));
        newNs.push(measure(SingleMapLru, kind, cap));
      } else {
        newNs.push(measure(SingleMapLru, kind, cap));
        oldNs.push(measure(DoubleMapLru, kind, cap));
      }
    }
    const oldMed = median(oldNs);
    const newMed = median(newNs);
    const ratio = oldMed / newMed;
    process.stdout.write(
      `${kind.padEnd(4)} cap=${String(cap).padEnd(5)} | double=${oldMed.toFixed(3)}us/op ` +
        `single=${newMed.toFixed(3)}us/op | ${ratio.toFixed(2)}x\n`,
    );
  }
}
process.stdout.write('\n(同进程交替 9 轮取 p50 中位数；判据看比值方向，绝对值受宿主影响不作 SLA)\n');
