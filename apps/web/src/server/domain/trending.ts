/**
 * §61 的 Trending：能排的依据，和不能排的那部分。
 *
 * 之前它被列进"排不出来"，理由是"库里只有累计浏览与点赞数"。那个理由现在不成立了：
 * 点赞、评论、收藏、改编每一行都带 `created_at`，访问按"访客 × 天"存着 `opens` 与 `day`——
 * 也就是说**按天的互动时间序列是真的存在**，于是"最近哪些作品在被动"可以算。
 *
 * 但算出来的东西只有这么多，所以限度必须一起给：
 * - 半衰期加权不是"热度"的定义，只是一种把新旧折中的算法；半衰期 3 天、窗口 7 天这两个数
 *   是**界面要写出来的参数**，不是藏在代码里的常数；
 * - 每种互动的权重（评论比点赞响、改编比评论更响）同样是选择而不是事实，写在这里供页面复述；
 * - 只在最近 N 条公开版本里排（见 `CANDIDATE_CAP`），不是全表扫——平台大了以后这里会先撑不住，
 *   而不是悄悄给出一个排错了的序。
 */

export const TRENDING_WINDOW_DAYS = 7;
export const TRENDING_HALF_LIFE_DAYS = 3;
/** 只在最近这么多条公开版本里算分：超过就是"排不出全表"，要明说而不是硬排 */
export const TRENDING_CANDIDATE_CAP = 200;

export type InteractionKind = 'like' | 'comment' | 'save' | 'remix' | 'open';

/** 权重是选择不是事实：改编最难发生所以最响，一次页面打开最廉价所以最轻 */
export const INTERACTION_WEIGHTS: Record<InteractionKind, number> = {
  like: 1,
  comment: 2,
  save: 1,
  remix: 3,
  open: 0.2,
};

export interface DecayBucket {
  kind: InteractionKind;
  /** 事件发生在几个整天之前：0 = 今天 */
  dayAgo: number;
  count: number;
}

const DAY_MS = 86_400_000;

/** 落在窗口外的（含未来的、时钟飘了的）一律不计，而不是给一个负权重 */
export function dayAgo(at: Date, now: Date = new Date()): number | null {
  const diff = Math.floor((now.getTime() - at.getTime()) / DAY_MS);
  if (diff < 0 || diff >= TRENDING_WINDOW_DAYS) return null;
  return diff;
}

export function decayFactor(dayAgoValue: number): number {
  return Math.pow(0.5, dayAgoValue / TRENDING_HALF_LIFE_DAYS);
}

/** 纯函数：把按天分桶的互动折成一个分数。桶为空就是 0 分，不补一个"看起来像热度"的底数 */
export function decayedScore(buckets: readonly DecayBucket[]): number {
  let total = 0;
  for (const bucket of buckets) {
    if (bucket.dayAgo < 0 || bucket.dayAgo >= TRENDING_WINDOW_DAYS) continue;
    total += bucket.count * (INTERACTION_WEIGHTS[bucket.kind] ?? 0) * decayFactor(bucket.dayAgo);
  }
  return Math.round(total * 1000) / 1000;
}

/** 页面上要复述的那句话，集中一处而不是散在模板里 */
export function trendingMethod(): string {
  return `最近 ${TRENDING_WINDOW_DAYS} 天的互动按半衰期 ${TRENDING_HALF_LIFE_DAYS} 天加权` + `（点赞 ${INTERACTION_WEIGHTS.like} · 评论 ${INTERACTION_WEIGHTS.comment} · 收藏 ${INTERACTION_WEIGHTS.save} · ` + `改编 ${INTERACTION_WEIGHTS.remix} · 一次打开 ${INTERACTION_WEIGHTS.open}）；` + `只在最近 ${TRENDING_CANDIDATE_CAP} 条公开版本里排。`;
}
