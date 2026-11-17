/**
 * 洞察台用的小数学——纯函数，全部可测。
 *
 * 为什么自己写最小二乘而不拉库：趋势预测只是对一组日计数的一条直线，
 * 引一个统计库进来是自找的依赖税。公式就是普通的 OLS：
 *   slope = Σ(x−x̄)(y−ȳ) / Σ(x−x̄)²，intercept = ȳ − slope·x̄，
 *   R² = 1 − SS_res / SS_tot（SS_tot = 0 且 SS_res = 0 ⇒ R² = 1，常数序列完美贴合）。
 * 诚实标注：这是「往过去拟合一条线，往前推 7 天」——不是因果推断，不是神谕。
 * 页面上必须把 R² 如实写出来；R² 太低或样本太少时结论一律标注「仅参考」。
 */

export interface LeastSquaresResult {
  slope: number;
  intercept: number;
  /** 决定系数 R²（0..1；无方差序列定义为 1） */
  r2: number;
}

/** 对 y_i 与 x = 0..n-1 做最小二乘；n<2 或 x 方差为 0 返回 null（不硬凑） */
export function leastSquares(ys: readonly number[]): LeastSquaresResult | null {
  const n = ys.length;
  if (n < 2) return null;
  let sumX = 0, sumY = 0;
  for (let i = 0; i < n; i++) { sumX += i; sumY += ys[i]!; }
  const meanX = sumX / n;
  const meanY = sumY / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) {
    const dx = i - meanX;
    const dy = ys[i]! - meanY;
    sxy += dx * dy;
    sxx += dx * dx;
    syy += dy * dy;
  }
  if (sxx === 0) return null;
  const slope = sxy / sxx;
  const intercept = meanY - slope * meanX;
  const ssRes = ys.reduce((acc, y, i) => {
    const residual = y - (slope * i + intercept);
    return acc + residual * residual;
  }, 0);
  const r2 = syy === 0 ? 1 : Math.max(0, 1 - ssRes / syy);
  return { slope, intercept, r2 };
}

/** 用拟合线向前外推 `horizon` 个点；不硬夹负数，但调用方可以看 abs 判断「外推到了 0 以下」 */
export function projectNext(ys: readonly number[], horizon: number): number[] | null {
  const fit = leastSquares(ys);
  if (!fit) return null;
  const out: number[] = [];
  for (let h = 1; h <= horizon; h++) {
    out.push(fit.slope * (ys.length - 1 + h) + fit.intercept);
  }
  return out;
}

/** 线性外推的原始和（例如「预测 7 天共多少新用户」）；null 向下游原样传 */
export function projectHorizonSum(ys: readonly number[], horizon: number): number | null {
  const next = projectNext(ys, horizon);
  if (!next) return null;
  return next.reduce((acc, v) => acc + v, 0);
}
