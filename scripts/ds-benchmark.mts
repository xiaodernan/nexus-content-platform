/**
 * § 数据结构热点路径基准：TtlLru 与 MemoryRateLimiter 的吞吐 / 延迟分布（v671）。
 *
 * 为什么单独一支、不带断言阈值：本机是共享宿主（旁边的容器与并行 lane 随时抢 CPU），把耗时
 * 写死成断言只会制造 flaky；flaky 的下一步通常是把断言删掉，那还不如一开始就把数字记进
 * `docs/PERFORMANCE.md`，让"这台机器这一刻"的读数由人眼与相邻规模的比例去读。
 * **可断言的是形状（复杂度），不是绝对时间**——那一半在
 * `apps/web/test/ds-complexity-contract.test.ts` 里用操作计数确定性钉住，不靠墙钟。
 *
 * 这里量的三件事都是**对照**而不是单点：
 *  1. TtlLru 命中成本 vs 容量：8 条与 8192 条两张满表，各做同样多次命中。
 *     Map 命中是 O(1) 均摊，两条曲线每操作耗时应当接近；若容量一大就变慢，说明有隐藏的全表扫描。
 *  2. TtlLru 上界洪水：写 100 万条进一张 256 上界的表。"上界被顶住时每次只淘汰一条"若被写坏成
 *     "每次排全表"，这一档会从线性塌成平方，吞吐断崖。
 *  3. MemoryRateLimiter 上界洪水：maxBuckets 固定，灌入远超上界的 distinct 桶。
 *     每次命中只淘汰一只 ⇒ 吞吐近似恒定；若退化成每次扫全表，桶数一多每操作成本就涨。
 *  4. （v673 / ADR 0106）单桶滑动窗口命中成本 vs limit（8 / 64 / 512）：同一只键填满到 limit
 *     后再连打，allowed=false 不再 push，但 `(hits).filter(t>cutoff)` 每笔仍扫满 limit 条。
 *     windowMs 设得远大于测量时长，确保时间戳整段不过期、读的是满窗口扫描。这条轴 v671 的数
 *     Map 操作门完全看不见（filter 不触发 Map 操作），这里只归档、看相邻 limit 的比例；确定性
 *     有界门的那一半在契约门的"封顶 / 正交"两条里。真正 O(limit²) 退化会让这段从线性塌成平方。
 *
 * 跑法：`npx tsx scripts/ds-benchmark.mts`（可选第二个参数控制规模倍率）。
 * 输出直接贴进 docs/PERFORMANCE.md；`--json` 走机器可读，供 CI 存档而不做阈值断言。
 */
import { performance } from 'node:perf_hooks';
import { TtlLru } from '../apps/web/src/server/cache/ttlLru';
import { MemoryRateLimiter } from '../apps/web/src/server/security/rateLimitMemory';

const JSON_OUT = process.argv.includes('--json');
const SCALE = Number.parseInt(process.argv.find((a) => /^\d+$/.test(a)) ?? '1', 10);
if (!Number.isFinite(SCALE) || SCALE < 1) throw new Error('规模倍率必须是正整数');

/** 一批操作的总耗时 + 吞吐 + 延迟分位数。计时用 monotonic clock；分位数对排序后的样本取最近秩。 */
interface BenchResult {
  label: string;
  ops: number;
  totalMs: number;
  opsPerSec: number;
  p50Us: number;
  p99Us: number;
  /** 每操作平均 Map 摊销成本的表述留给契约门；这里是墙钟读数。 */
  nsPerOp: number;
}

const percentile = (sorted: number[], q: number): number => {
  if (sorted.length === 0) return 0;
  const rank = Math.min(sorted.length - 1, Math.floor(q * (sorted.length - 1)));
  return sorted[rank]!;
};

/**
 * 跑一批操作。**分批计时**而不是逐个记单调时钟：逐操作 `performance.now()` 在这台宿主上
 * 一次调用约几十~几百 ns，与 TtlLru 命中的真实成本同量级，40 万次计时会把吞吐读数整个吃掉
 * （首版就量出 ns/op 与 p50 自相矛盾的假数，已弃用）。这里每 `CHUNK` 次量一段总时长：
 * 吞吐用全长（只 2 次计时），延迟分布用每块的**每操作均值**作样本（计时调用降到 ~几百次），
 * 于是 p50/p99 量的是"落在哪一段的块"，粒度粗但不会被仪器本身带偏。
 */
const CHUNK = 512;
function bench(label: string, ops: number, fn: (i: number) => void): BenchResult {
  const perOpMs: number[] = [];
  let done = 0;
  const t0 = performance.now();
  while (done < ops) {
    const n = Math.min(CHUNK, ops - done);
    const a = performance.now();
    for (let j = 0; j < n; j += 1) fn(done + j);
    const b = performance.now();
    perOpMs.push((b - a) / n);
    done += n;
  }
  const totalMs = performance.now() - t0;
  const sorted = perOpMs.sort((x, y) => x - y);
  return {
    label,
    ops,
    totalMs: +totalMs.toFixed(2),
    opsPerSec: totalMs > 0 ? Math.round((ops / totalMs) * 1000) : 0,
    p50Us: +(percentile(sorted, 0.5) * 1000).toFixed(3),
    p99Us: +(percentile(sorted, 0.99) * 1000).toFixed(3),
    nsPerOp: +((totalMs * 1_000_000) / Math.max(1, ops)).toFixed(1),
  };
}

const HIT_OPS = 200_000 * SCALE;
const TTL_FLOOD = 400_000 * SCALE;
const RL_FLOOD = 60_000 * SCALE;
const results: BenchResult[] = [];

/* ── 1. TtlLru 命中成本不随容量涨 ─────────────────────────────────────── */
for (const capacity of [8, 8192]) {
  const cache = new TtlLru<number, number>({ maxEntries: capacity, defaultTtlMs: 0 });
  for (let i = 0; i < capacity; i += 1) cache.set(i, i);
  results.push(
    bench(`TtlLru hit (capacity=${capacity})`, HIT_OPS, (i) => {
      cache.get(i % capacity);
    }),
  );
}

/* ── 2. TtlLru 上界洪水：每次只淘汰一条 ⇒ 线性 ────────────────────────── */
{
  const cache = new TtlLru<number, number>({ maxEntries: 256, defaultTtlMs: 0 });
  results.push(
    bench(`TtlLru flood (maxEntries=256, ${TTL_FLOOD} sets)`, TTL_FLOOD, (i) => {
      cache.set(i, i);
    }),
  );
}

/* ── 3. MemoryRateLimiter 上界洪水：摊还 O(1) 淘汰 ⇒ 吞吐恒定 ─────────── */
for (const maxBuckets of [64, 4096]) {
  const rl = new MemoryRateLimiter({ maxBuckets, sweepEveryHits: 10_000 });
  results.push(
    bench(`MemoryRateLimiter flood (maxBuckets=${maxBuckets}, ${RL_FLOOD} distinct keys)`, RL_FLOOD, (i) => {
      // hit 是 async，但内部同步算完才 resolve；这里不 await，测的是同一段同步工作 + Promise 分配。
      // 为了不堆 6 万个未决 Promise，忽略返回值即可（MemoryRateLimiter 立即 resolve）。
      void rl.hit(`gate|v${i}|10.0.0.1`, 1, 600_000);
    }),
  );
}

/* ── 4. 单桶滑动窗口命中成本 vs limit（v673：第二条复杂度轴，只归档） ── */
for (const limit of [8, 64, 512]) {
  const rl = new MemoryRateLimiter({ maxBuckets: 1000, sweepEveryHits: 10_000_000 });
  const key = 'gate|single-bucket|10.0.0.1';
  // windowMs 取 1 小时：整段 bench 内所有时间戳都不过期，满桶后 filter 恒扫 limit 条。
  for (let i = 0; i < limit; i += 1) void rl.hit(key, limit, 3_600_000);
  results.push(
    bench(`single-bucket hit at cap (limit=${limit})`, Math.max(HIT_OPS, 20_000), () => {
      void rl.hit(key, limit, 3_600_000); // allowed=false：不 push，仍 filter 扫满 limit 条
    }),
  );
}

/* ── 输出 ─────────────────────────────────────────────────────────────── */
if (JSON_OUT) {
  process.stdout.write(JSON.stringify({ scale: SCALE, results }, null, 2) + '\n');
} else {
  const host = `node ${process.version} / ${process.platform} ${process.arch}`;
  process.stdout.write(`\nNEXUS data-structure benchmark — ${host} — scale=${SCALE}\n`);
  process.stdout.write('（共享宿主读数，只作对照与归档；阈值断言在 ds-complexity-contract.test.ts）\n\n');
  process.stdout.write(
    'label'.padEnd(58) + 'ops'.padStart(10) + 'total ms'.padStart(12) +
      'ops/s'.padStart(12) + 'p50 us'.padStart(11) + 'p99 us'.padStart(11) + 'ns/op'.padStart(11) + '\n',
  );
  process.stdout.write('-'.repeat(125) + '\n');
  for (const r of results) {
    process.stdout.write(
      r.label.padEnd(58) + String(r.ops).padStart(10) + String(r.totalMs).padStart(12) +
        String(r.opsPerSec).padStart(12) + String(r.p50Us).padStart(11) +
        String(r.p99Us).padStart(11) + String(r.nsPerOp).padStart(11) + '\n',
    );
  }
  process.stdout.write('\n');
}
