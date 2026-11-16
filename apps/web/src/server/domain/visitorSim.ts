/**
 * §SIM-1 真实用户行为模拟（admin 演练）
 *
 * 仿照真实用户的访问样本分布，生成**可投喂给现有流量管线的人·天行数**——
 * 目的不是造出「看起来很热闹」的图，而是把底层的插入/聚合口径在真实库上演练几次，
 * 让运维看到 bot-pressure / churn-risk 这些信号确实会在压力下正确触发。
 *
 * 纪律（与 `/pulse` 同一条线）：
 * - 生成出来的全部写进 `publication_visits` 并标 `suspectedBot = true`——
 *   这一页之后在任何地方看到的自动化负担里，它们都跟爬虫一样被挑出来；
 *   **绝不**被冒充成真人数据、绝不合并计入人数。
 * - 全流程纯函数 + 一个可注入的 inserter；DB 写入的那份是 `runVisitorSimulation`，
 *   测试用内存 inserter，不连库。
 */
export type VisitorProfile =
  | 'impatient'
  | 'clicker'
  | 'deep-reader'
  | 'rage-clicker'
  | 'fat-finger'
  | 'crawler';

/** 采样权重（总和 100）：没耐心的人最多，深读者最少——符合真实用户的分布形态 */
export const PROFILE_WEIGHTS = {
  impatient: 35,
  clicker: 25,
  'deep-reader': 15,
  'rage-clicker': 10,
  'fat-finger': 10,
  crawler: 5,
} as const satisfies Record<VisitorProfile, number>;

/** 单次造访里每个人··天会产生几次打开 */
const OPEN_COUNT: Record<VisitorProfile, (r: () => number) => number> = {
  impatient: (r) => 1,
  clicker: (r) => 2 + Math.floor(r() * 4),
  'deep-reader': (r) => 1,
  'rage-clicker': (r) => 3 + Math.floor(r() * 4),
  'fat-finger': (r) => 1,
  crawler: (r) => 1,
};

/** 人·天行数的持续时间（可见毫秒），按轮廓不同分布 */
const VISIBLE_MS: Record<VisitorProfile, (r: () => number) => number> = {
  impatient: (r) =>
    r() < 0.65
      ? Math.floor(150 + r() * 1200) // 没耐心：上来就关掉
      : Math.floor(8000 + r() * 15000), // 一少部分还是看了一会儿
  clicker: (r) => Math.floor(12000 + r() * 30000),
  'deep-reader': (r) => Math.floor(25000 + r() * 45000),
  'rage-clicker': (r) => Math.floor(400 + r() * 1500),
  'fat-finger': (r) => Math.floor(6000 + r() * 8000), // 手感不好但愿意待
  crawler: (r) => Math.floor(50 + r() * 250),
};

/** 最终滚到多少百分比；没耐心的基本 0-15%；深读者 ≥85%；复合轮廓混着来 */
const COMPLETION_PCT: Record<VisitorProfile, (r: () => number) => number> = {
  impatient: (r) => Math.floor(r() * 16),
  clicker: (r) => Math.floor(20 + r() * 60),
  'deep-reader': (r) => Math.floor(85 + r() * 15),
  'rage-clicker': (r) => Math.floor(r() * 12),
  'fat-finger': (r) => (r() < 0.33 ? 95 + Math.floor(r() * 5) : Math.floor(10 + r() * 40)),
  crawler: (r) => 0,
};

export interface SimulatedVisit {
  profile: VisitorProfile;
  opens: number;
  visibleMs: number;
  completionPct: number;
  suspectedBot: true;
}

/** 确定性 PRNG（mulberry32）：同 seed 可复现——演练可重放、测试稳 */
export function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return function next() {
    t += 0x6d2b79f5;
    let x = Math.imul(t ^ (t >>> 15), 1 | t);
    x ^= x + Math.imul(x ^ (x >>> 7), 61 | x);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

function pickProfile(rand: () => number): VisitorProfile {
  let roll = rand() * 100;
  for (const [profile, weight] of Object.entries(PROFILE_WEIGHTS) as [VisitorProfile, number][]) {
    if (roll < weight) return profile;
    roll -= weight;
  }
  return 'impatient';
}

/** 集中产出 N 个人·天（单行/profile 一条） */
export function simulateVisits(count: number, seed: number): SimulatedVisit[] {
  if (!Number.isInteger(count) || count <= 0) return [];
  const clamped = Math.min(count, 500); // 一口不过大，别一次刷掉一周的预算
  const rand = mulberry32(seed);
  const out: SimulatedVisit[] = [];
  for (let i = 0; i < clamped; i++) {
    const profile = pickProfile(rand);
    out.push({
      profile,
      opens: OPEN_COUNT[profile](rand),
      visibleMs: VISIBLE_MS[profile](rand),
      completionPct: COMPLETION_PCT[profile](rand),
      suspectedBot: true,
    });
  }
  return out;
}

/** 给定一批模拟数据，返回 profile 分布与平均可见基数 */
export function summarize(visits: readonly SimulatedVisit[]): {
  total: number;
  totalOpens: number;
  avgVisibleMs: number;
  avgCompletionPct: number;
  byProfile: Record<VisitorProfile, number>;
} {
  const byProfile = Object.fromEntries(
    Object.keys(PROFILE_WEIGHTS).map((k) => [k, 0]) as [VisitorProfile, number][],
  ) as Record<VisitorProfile, number>;
  if (visits.length === 0) {
    return { total: 0, totalOpens: 0, avgVisibleMs: 0, avgCompletionPct: 0, byProfile };
  }
  let totalOpens = 0;
  let visibleSum = 0;
  let completionSum = 0;
  for (const v of visits) {
    byProfile[v.profile] += 1;
    totalOpens += v.opens;
    visibleSum += v.visibleMs;
    completionSum += v.completionPct;
  }
  return {
    total: visits.length,
    totalOpens,
    avgVisibleMs: Math.round(visibleSum / visits.length),
    avgCompletionPct: Math.round((completionSum / visits.length) * 10) / 10,
    byProfile,
  };
}
