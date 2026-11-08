import { describe, expect, it } from 'vitest';
import {
  INTERACTION_WEIGHTS,
  TRENDING_CANDIDATE_CAP,
  TRENDING_HALF_LIFE_DAYS,
  TRENDING_WINDOW_DAYS,
  dayAgo,
  decayedScore,
  trendingMethod,
} from '../src/server/domain/trending';

/**
 * §61 Trending 的那点算术。它看起来人畜无害，但它是**页面上会被读成"平台公认最热"的一个序**，
 * 所以这里钉的全是"这个数会不会多说话"：空桶必须是 0（不补底数）、窗口外必须不计、
 * 半衰期必须真的把三天前折成一半。
 */

const DAY = 86_400_000;
const now = new Date('2026-09-25T12:00:00Z');

describe('dayAgo', () => {
  it('今天 0、六天前 6、七天与未来都不计', () => {
    expect(dayAgo(now, now)).toBe(0);
    expect(dayAgo(new Date(now.getTime() - 6 * DAY), now)).toBe(6);
    expect(dayAgo(new Date(now.getTime() - 7 * DAY), now)).toBe(null);
    expect(dayAgo(new Date(now.getTime() - 30 * DAY), now)).toBe(null);
    // 时钟飘到未来：不计，而不是给一个负数权重把分数抬高
    expect(dayAgo(new Date(now.getTime() + DAY), now)).toBe(null);
  });
});

describe('decayedScore', () => {
  it('没有互动就是 0 分，不补一个看起来像热度的底数', () => {
    expect(decayedScore([])).toBe(0);
  });

  it('半衰期真的把三天前折成一半、六天前折成四分之一', () => {
    const today = decayedScore([{ kind: 'like', dayAgo: 0, count: 1 }]);
    const threeDays = decayedScore([{ kind: 'like', dayAgo: 3, count: 1 }]);
    const sixDays = decayedScore([{ kind: 'like', dayAgo: 6, count: 1 }]);
    expect(today).toBe(INTERACTION_WEIGHTS.like);
    expect(threeDays).toBeCloseTo(today / 2, 6);
    expect(sixDays).toBeCloseTo(today / 4, 6);
  });

  it('一条评论和两个点赞同分（权重是选择，写清楚就行）', () => {
    expect(decayedScore([{ kind: 'comment', dayAgo: 2, count: 1 }])).toBe(
      decayedScore([{ kind: 'like', dayAgo: 2, count: 2 }]),
    );
  });

  it('窗口外的桶直接不参与，而不是被算成 0 天', () => {
    expect(decayedScore([{ kind: 'remix', dayAgo: 99, count: 50 }])).toBe(0);
    expect(decayedScore([{ kind: 'remix', dayAgo: -1, count: 50 }])).toBe(0);
  });

  it('一次打开比一个点赞轻得多：浏览量不会自己变成热度', () => {
    expect(INTERACTION_WEIGHTS.open).toBeLessThan(INTERACTION_WEIGHTS.like);
    expect(decayedScore([{ kind: 'open', dayAgo: 0, count: 10 }])).toBeLessThan(
      decayedScore([{ kind: 'like', dayAgo: 0, count: 10 }]),
    );
  });
});

it('页面上复述的方法句里，参数与候选集上限都是真常数', () => {
  const method = trendingMethod();
  expect(method).toContain(String(TRENDING_WINDOW_DAYS));
  expect(method).toContain(String(TRENDING_HALF_LIFE_DAYS));
  expect(method).toContain(String(TRENDING_CANDIDATE_CAP));
  // 反向对照：这句话不能只写"按热度排"——那等于把算法藏起来
  expect(method).not.toBe('按热度排序');
});
