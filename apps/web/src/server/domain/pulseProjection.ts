/**
 * §PULSE-PRED · 平台流量的规则式预测
 *
 * 一条纪律：不调用模型、不走 fetch、不依赖时区以外的任何东西。
 * 全部输出都是确定性纯函数，可以在测试里点名。
 *
 * 两件事：
 * 1. `fitLinear(points)` — 14 天柱子的最小二乘拟合（斜率、截距）。
 *    不用多项式（过拟合），不用指数平滑（预热期长）——14 天的窗口配一阶线性最稳。
 * 2. `projectForward(points, days)` — 从拟合到的直线外推 N 天，给出预测值与置信宽度（std dev）。
 *    置信宽度 = 残差标准差；置信带 = 预测值 ± 1.28σ（≈80% 的意思，措辞是"约 80%"，不claim 精确）。
 */

export interface DayPoint {
  day: string;
  opens: number;
}

export interface LinearFit {
  slope: number;
  intercept: number;
  residualStd: number;
  /** 拟合用的天数——就是入参长度 */
  n: number;
  /** 最后一个点的 x（日索引），用于外推 */
  lastX: number;
}

/** 最小二乘一阶线性拟合。空输入 → 返回全零平凡解（n=0）。 */
export function fitLinear(points: readonly DayPoint[]): LinearFit {
  if (points.length === 0) {
    return { slope: 0, intercept: 0, residualStd: 0, n: 0, lastX: -1 };
  }
  let sumX = 0;
  let sumY = 0;
  let sumXy = 0;
  let sumXx = 0;
  const n = points.length;
  for (let i = 0; i < n; i++) {
    const y = points[i]!.opens;
    sumX += i;
    sumY += y;
    sumXy += i * y;
    sumXx += i * i;
  }
  const denom = n * sumXx - sumX * sumX;
  const slope = denom === 0 ? 0 : (n * sumXy - sumX * sumY) / denom;
  const intercept = (sumY - slope * sumX) / n;

  // 残差标准差（n≥2 才有意义；n=1 时残差平均描述无所谓）
  let ssRes = 0;
  for (let i = 0; i < n; i++) {
    const yHat = slope * i + intercept;
    const r = points[i]!.opens - yHat;
    ssRes += r * r;
  }
  const residualStd = n > 2 ? Math.sqrt(ssRes / (n - 2)) : 0;

  return { slope, intercept, residualStd, n, lastX: n - 1 };
}

export interface ProjectionPoint {
  dayOffset: number;
  projected: number;
  lower80: number;
  upper80: number;
}

/** 从最后一个点外推 days 天，给出预测值与约 80% 置信带 */
export function projectForward(
  points: readonly DayPoint[],
  days: number,
): { fit: LinearFit; projected: ProjectionPoint[] } {
  const fit = fitLinear(points);
  if (fit.n === 0 || days <= 0) return { fit, projected: [] };
  const projected: ProjectionPoint[] = [];
  for (let i = 1; i <= days; i++) {
    const x = fit.lastX + i;
    const projectedRaw = fit.slope * x + fit.intercept;
    const projectedValue = Math.max(0, Math.round(projectedRaw));
    const band = Math.round(1.28 * fit.residualStd);
    projected.push({
      dayOffset: i,
      projected: projectedValue,
      lower80: Math.max(0, projectedValue - band),
      upper80: projectedValue + band,
    });
  }
  return { fit, projected };
}

export interface Volatility {
  mean: number;
  stdDev: number;
  /** 变异系数 stdev/mean——跨尺寸比较用 */
  coefficientOfVariation: number;
  /** 最近一个点比前一个点 +/- 多少 % */
  lastDayDeltaPct: number | null;
  /** 14 天里最高与最低比值 */
  peakToTroughRatio: number | null;
}

/** 简单统计量：均值、标准差、变异系数、相邻 delta、峰谷比 */
export function summarizeVolatility(points: readonly DayPoint[]): Volatility {
  if (points.length === 0) {
    return { mean: 0, stdDev: 0, coefficientOfVariation: 0, lastDayDeltaPct: null, peakToTroughRatio: null };
  }
  const values = points.map((p) => p.opens);
  const mean = values.reduce((acc, y) => acc + y, 0) / values.length;
  let ss = 0;
  for (const v of values) ss += (v - mean) ** 2;
  const stdDev = Math.sqrt(ss / values.length);
  const coefficientOfVariation = mean === 0 ? 0 : stdDev / mean;

  let lastDayDeltaPct: number | null = null;
  if (points.length >= 2) {
    const prev = values[values.length - 2]!;
    const curr = values[values.length - 1]!;
    if (prev !== 0) lastDayDeltaPct = Math.round(((curr - prev) / prev) * 100);
  }

  const peak = Math.max(...values);
  const trough = Math.min(...values);
  const peakToTroughRatio = trough === 0 ? null : peak / trough;

  return { mean, stdDev, coefficientOfVariation, lastDayDeltaPct, peakToTroughRatio };
}

/** 规则式下一步建议：输入 trend 形状 + 平台推荐 + 波动，返回可落地的中文/英文行动项 */
export interface PublicAction {
  zh: string;
  en: string;
  /** 这条来自哪一条数字 */
  basis: string;
}

export function buildPublicActions({
  opensDelta,
  visitorDaysDelta,
  botShare,
  projected7d,
  coefficientOfVariation,
}: {
  opensDelta: number | null;
  visitorDaysDelta: number | null;
  botShare: number;
  projected7d: number | null;
  coefficientOfVariation: number;
}): PublicAction[] {
  const out: PublicAction[] = [];

  if (botShare > 0.3) {
    out.push({
      zh: '爬虫占比仍然过半：先别冲增长——先做好真实性校验（honey token / UA 评分），把爬虫与真人分开记账；再去看 /admin/behavior-sim 重跑一轮，确认警报触发正确。',
      en: 'Automation dominates the opens — freeze the growth push, wire a realness gate (honey token / UA scoring), split the ledgers, then re-run /admin/behavior-sim and confirm the bot-pressure warning trips correctly.',
      basis: `botShare=${Math.round(botShare * 100)}%`,
    });
  }

  if (coefficientOfVariation > 0.85) {
    out.push({
      zh: `14 天波动率 ${coefficientOfVariation.toFixed(2)}——发布节奏不稳是最大嫌疑人：没有稳定内容脉冲，真人就没有回来的理由。下一步：设定每周固定更新节奏（周五？周六？），把推送窗口钉在几个固定时段。`,
      en: `Volatility at ${coefficientOfVariation.toFixed(2)} (14d std-dev/mean) is abnormally high — a steady heartbeat of fresh work is the only real fix. Pin a weekly release slot and lock the feed to it.`,
      basis: `cv=${coefficientOfVariation.toFixed(2)}`,
    });
  }

  if (opensDelta !== null && opensDelta <= -30) {
    out.push({
      zh: `打开数环比 -30%+：最大的嫌疑不是产品——是入口。把 /discover 的卡片顺序重排，先展示"完成率最高+最近一次点赞最多"的作品，不按时间混排；再去看 hot Top-3 把热度真正喂给上新。`,
      en: `Opens dropped >30% half-over-half: the suspect is the doorway, not the product — re-sort /discover by completion-rate, then by latest-likes (not time), and feed the hot Top-3 back in.`,
      basis: `opensDelta=${opensDelta}%`,
    });
  }

  if (visitorDaysDelta !== null && visitorDaysDelta < 0) {
    out.push({
      zh: `人·天这一项在下滑——说明不是首访问题，是复访回路没建立。把 /credits 的"每天回来一次领完整额度"显式写进登录页；再给 bot-pressure 流失的真人推送一个"你大概忘了这里有一个世界"的提醒。`,
      en: 'Person-days are falling — this is a retention problem, not an acquisition problem. Surface the daily login credit explicitly on the sign-in screen, and push "there is a world you keep forgetting" to the suspended cohort.',
      basis: `visitorDaysDelta=${visitorDaysDelta}%`,
    });
  }

  if (projected7d !== null) {
    out.push({
      zh: `14 天打开数按直线 — ${projected7d} 次/周？不如现在：在 hot Top-3 里挑出 1 个，每天固定时段转发到社交入口；新用户第一眼看到的就是完成度 85%+ 的样张，而不是一个空着的画布。`,
      en: `If 14-day opens linearly extrapolate to ~${projected7d}/week, lean into it: pick 1 hot artifact, push it on a fixed cadence to social, and put an 85%+ completion example as the very first thing a new visitor sees.`,
      basis: `projected7d=${projected7d}`,
    });
  }

  if (out.length < 3) {
    out.push({
      zh: '平台运营下一步：把 hot Top-3 变成重复曝光（固定 5 个触达点），而不是"看一眼就关掉"。流量数据已经够好——现在是分发问题。',
      en: 'Distribution, clearly: 5 fixed slots for the hot Top-3, not one-time attention. The traffic graph is fine — the funnel is what leaks.',
      basis: 'baseline=good-flow',
    });
  }

  return out;
}
