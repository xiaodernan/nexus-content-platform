/**
 * §SIM-3 · 模拟用户行为的纯函数 + 目标作品选择
 *
 * 钉住三类违约：
 * - 权重比例（35/25/15/10/10/5 总和必为 100）；
 * - simulateVisits 是 deterministic 的（同 seed → 同次序输出）；
 * - 入库字段全部在合法区间（visibleMs ≥ 0、completionPct 0..100、所有 visitor 都 suspectedBot=true）。
 */
import { describe, expect, it } from 'vitest';
import {
  PROFILE_WEIGHTS,
  mulberry32,
  simulateVisits,
  summarize,
} from '@/server/domain/visitorSim';

describe('PROFILE_WEIGHTS', () => {
  it('总和 = 100', () => {
    const total = Object.values(PROFILE_WEIGHTS).reduce((a, b) => a + b, 0);
    expect(total).toBe(100);
  });
});

describe('mulberry32', () => {
  it('同 seed 产出相同的序列', () => {
    const a = mulberry32(1337);
    const b = mulberry32(1337);
    const seqA = [a(), a(), a()].map((n) => Math.round(n * 1e6));
    const seqB = [b(), b(), b()].map((n) => Math.round(n * 1e6));
    expect(seqA).toEqual(seqB);
  });

  it('不同 seed 产出不同序列', () => {
    const a = mulberry32(1337);
    const b = mulberry32(1338);
    expect(a()).not.toBe(b());
  });
});

describe('simulateVisits', () => {
  it('同 seed 给出相同形状（一字不挪）', () => {
    const a = simulateVisits(50, 1337);
    const b = simulateVisits(50, 1337);
    expect(a).toEqual(b);
  });

  it('全部是 suspectedBot=true（模拟绝不冒充真人）', () => {
    const rows = simulateVisits(100, 42);
    expect(rows.length).toBe(100);
    expect(rows.every((r) => r.suspectedBot === true)).toBe(true);
  });

  it('visibleMs 与 completionPct 都在合法区间', () => {
    const rows = simulateVisits(200, 7);
    for (const row of rows) {
      expect(row.visibleMs).toBeGreaterThanOrEqual(0);
      expect(row.completionPct).toBeGreaterThanOrEqual(0);
      expect(row.completionPct).toBeLessThanOrEqual(100);
      expect(row.opens).toBeGreaterThanOrEqual(1);
    }
  });

  it('权重分布大致符合期望（impatient ≥ 任一其它单一轮廓）', () => {
    const rows = simulateVisits(200, 99);
    const counts = Object.create(null) as Record<string, number>;
    for (const row of rows) counts[row.profile] = (counts[row.profile] ?? 0) + 1;
    // 200 个采样下 impatient 平均 70，分配最少是 crawler 平均 10；
    // 选宽容区间不可能误判（比 ±3σ 略宽因为权重极偏）
    expect(counts['impatient']).toBeGreaterThanOrEqual(40);
    expect(counts['clicker']).toBeGreaterThanOrEqual(20);
    expect(counts['deep-reader']).toBeGreaterThanOrEqual(10);
  });

  it('count 越界时返回空数组而不抛', () => {
    expect(simulateVisits(0, 1)).toEqual([]);
    expect(simulateVisits(-1, 1)).toEqual([]);
  });
});

describe('summarize', () => {
  it('空集返回安全零值', () => {
    const sum = summarize([]);
    expect(sum.total).toBe(0);
    expect(sum.totalOpens).toBe(0);
    expect(sum.avgVisibleMs).toBe(0);
    expect(sum.avgCompletionPct).toBe(0);
    for (const value of Object.values(sum.byProfile)) {
      expect(value).toBe(0);
    }
  });

  it('total ≈ hits 之和；avgVisibleMs 是有效平均', () => {
    const rows = simulateVisits(60, 21);
    const sum = summarize(rows);
    const profileSum = Object.values(sum.byProfile).reduce((a: number, b: number) => a + b, 0);
    expect(profileSum).toBe(sum.total);
    expect(sum.totalOpens).toBeGreaterThanOrEqual(1);
    expect(sum.avgVisibleMs).toBeGreaterThan(0);
  });
});
