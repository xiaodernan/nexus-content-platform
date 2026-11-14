/**
 * 全抖动指数退避（计网经典，AWS 的 "Exponential Backoff and Jitter" 那一版）。
 *
 * 为什么不是裸 `base * 2^attempt`：N 个 admin 浏览器同时盯着态势面板、上游网关同一刻抖一下，
 * 所有客户端会在**完全相同**的时刻重试——这叫惊群（thundering herd），会把一次小抖动放大成一波
 * 同步洪峰。全抖动把第 n 次的等待从定值改成 `rng() * min(cap, base * 2^n)`，让重试在时间轴上散开。
 *
 * 为什么 rng 是参数：判据要能验电。注入 `() => 0` / `() => 1` 就能把随机区间钉成确定边界，
 * 否则"退避确实在"这条只能靠跑很多次看分布——那种测试本身就会 flaky。
 *
 * 上限 cap 是硬顶：指数不封顶会在第 10 次就等到以小时计，态势面板等不起，也没意义。
 */

export interface BackoffOptions {
  readonly baseMs: number;
  readonly capMs: number;
  readonly maxDelayMs?: number;
}

/** 第 attempt 次（0 起）失败后的退避天花板：指数增长、cap 封顶。 */
export function backoffCeiling(attempt: number, baseMs: number, capMs: number): number {
  const n = Math.max(0, Math.floor(attempt));
  // 用逐次乘 2 而非 Math.pow，避免 attempt 很大时 2^n 溢出成 Infinity 再被 min 兜住——
  // 那种写法在溢出前一步的答案是对的，溢出那一步靠 min 侥幸也对，但中间没有可解释的界。
  let value = Math.max(0, baseMs);
  for (let i = 0; i < n; i += 1) {
    if (value >= capMs) return capMs;
    value *= 2;
  }
  return Math.min(value, capMs);
}

/** 全抖动：在 `[0, ceiling]` 上均匀取一发。上界必然 ≤ capMs。 */
export function fullJitter(
  attempt: number,
  baseMs: number,
  capMs: number,
  rng: () => number = Math.random,
): number {
  const ceiling = backoffCeiling(attempt, baseMs, capMs);
  const r = Math.min(1, Math.max(0, rng()));
  return Math.floor(r * ceiling);
}

/** 生成一整条重试延迟序列，供客户端与判据共用同一份算法（不是两处各抄一个）。 */
export function jitterSchedule(attempts: number, opts: BackoffOptions, rng: () => number = Math.random): number[] {
  const out: number[] = [];
  for (let i = 0; i < Math.max(0, attempts); i += 1) {
    out.push(fullJitter(i, opts.baseMs, opts.capMs, rng));
  }
  return out;
}
