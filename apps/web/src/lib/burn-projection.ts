/**
 * 「点数燃烧速度」—— /credits 页的小型预测器（v700 / ROADMAP）。
 *
 * 纯函数、零依赖、可单测。输入全是数字与 ISO 日期；页面只消费输出。
 *
 * 诚实边界（写在这里是因为这里容易被读到）：
 * - 只统计**消费**（delta<0），发放不计燃烧；预测就是对未来的线性外推，不是承诺；
 * - 活跃燃烧天数少于 3 天 → 不预测（'insufficient-data'）；近 30 天斜率 ≥ 0（没有下降趋势）→ 'no-burn'；
 * - 外推天数封顶 9999，引导词照实说"超过一万天，机器算不出人人都信"；
 * - 样本少时均值也报出来，但标注"样本 N 天"，不冒充精确；
 * - 不发 "每月 1 日自动恢复"：免费档没有续期发放的实证（readCredits 幂等发放只保证本月已发）。
 */

export interface DailyBurn {
  /** YYYY-MM-DD（UTC） */
  day: string;
  /** 当天燃烧点数（正数） */
  burned: number;
}

export type BurnVerdict = 'projecting' | 'no-burn' | 'insufficient-data';

export interface BurnProjection {
  /** oldest -> newest，长度 = days，补零 */
  series: number[];
  days: number;
  /** 窗口内 nonzero 天数 */
  activeDays: number;
  totalBurned: number;
  /** 窗口均值（total / days） */
  avgPerDay: number;
  /** 最小二乘斜率（点/天）；样本退化时为 0 */
  slopePerDay: number;
  verdict: BurnVerdict;
  /** verdict === 'projecting' 时才有值（已 ceil 且封顶 9999） */
  daysUntilEmpty: number | null;
  /** YYYY-MM-DD；verdict === 'projecting' 时给出（封顶也给，但 daysUntilEmpty=9999） */
  exhaustDate: string | null;
}

const MS_PER_DAY = 86_400_000;

/** 'YYYY-MM-DD' -> 该日 UTC 0 点的毫秒数；非法输入返回 null */
export function isoDayToUtcMs(day: string): number | null {
  if (typeof day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  const ms = Date.parse(`${day}T00:00:00.000Z`);
  return Number.isFinite(ms) ? ms : null;
}

export function utcMsToIsoDay(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/**
 * 补零成固定窗口。传入的行按 day 聚合、无重复；非法行丢弃；窗口外的旧行丢弃。
 */
export function zeroFill(rows: readonly DailyBurn[], days: number, todayMs: number): number[] {
  if (!Number.isInteger(days) || days < 1 || !Number.isFinite(todayMs)) {
    return new Array<number>(Math.max(0, Math.trunc(days) || 0)).fill(0);
  }
  const endDayMs = Math.floor(todayMs / MS_PER_DAY) * MS_PER_DAY;
  const startDayMs = endDayMs - (days - 1) * MS_PER_DAY;
  const series = new Array<number>(days).fill(0);
  for (const row of rows) {
    const ms = isoDayToUtcMs(row?.day);
    if (ms === null) continue;
    const burned = Number(row?.burned);
    if (!Number.isFinite(burned) || burned <= 0) continue;
    const index = Math.round((ms - startDayMs) / MS_PER_DAY);
    if (index < 0 || index >= days) continue;
    series[index] = series[index]! + burned;
  }
  return series;
}

/**
 * 最小二乘法（正规方程 2x2 闭式解）：y = slope * x + intercept。
 * x 取等间隔 0..n-1（天），无需再归一。
 * 退化（n < 2 或 x 方差为 0）返回 null。
 */
export function leastSquares(ys: readonly number[]): { slope: number; intercept: number } | null {
  const n = ys.length;
  if (n < 2) return null;
  let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
  for (let i = 0; i < n; i += 1) {
    const x = i;
    const y = Number(ys[i]);
    if (!Number.isFinite(y)) return null;
    sumX += x;
    sumY += y;
    sumXY += x * y;
    sumXX += x * x;
  }
  const denominator = n * sumXX - sumX * sumX;
  if (Math.abs(denominator) < 1e-12) return null;
  const slope = (n * sumXY - sumX * sumY) / denominator;
  const intercept = (sumY - slope * sumX) / n;
  return Number.isFinite(slope) && Number.isFinite(intercept) ? { slope, intercept } : null;
}

export const EXHAUST_CAP_DAYS = 9999;
const MIN_ACTIVE_DAYS = 3;

export function projectBurn(balance: number, series: readonly number[], todayMs = Date.now()): BurnProjection {
  const clean = series.map((v) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : 0));
  const totalBurned = clean.reduce((a, b) => a + b, 0);
  const activeDays = clean.filter((v) => v > 0).length;
  const days = clean.length;
  const avgPerDay = days > 0 ? totalBurned / days : 0;
  const balanceSafe = Number.isFinite(balance) ? Math.max(0, balance) : 0;

  if (days < 2 || activeDays < MIN_ACTIVE_DAYS) {
    return {
      series: clean,
      days,
      activeDays,
      totalBurned,
      avgPerDay,
      slopePerDay: 0,
      verdict: 'insufficient-data',
      daysUntilEmpty: null,
      exhaustDate: null,
    };
  }

  const fit = leastSquares(clean);
  if (!fit || fit.slope >= -1e-9) {
    return {
      series: clean,
      days,
      activeDays,
      totalBurned,
      avgPerDay,
      slopePerDay: fit ? Math.max(0, fit.slope) : 0,
      verdict: 'no-burn',
      daysUntilEmpty: null,
      exhaustDate: null,
    };
  }

  const daysUntilEmpty = Math.min(EXHAUST_CAP_DAYS, Math.max(0, Math.ceil(balanceSafe / -fit.slope)));
  const exhaustDate = utcMsToIsoDay(Math.floor(todayMs / MS_PER_DAY) * MS_PER_DAY + daysUntilEmpty * MS_PER_DAY);
  return {
    series: clean,
    days,
    activeDays,
    totalBurned,
    avgPerDay,
    slopePerDay: fit.slope,
    verdict: 'projecting',
    daysUntilEmpty,
    exhaustDate,
  };
}
