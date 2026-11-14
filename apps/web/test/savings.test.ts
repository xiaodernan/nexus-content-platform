import { describe, expect, it } from 'vitest';
import { savingsFromAggregates, type SavingsAggregates } from '../src/lib/savings';

function agg(over: Partial<SavingsAggregates> = {}): SavingsAggregates {
  return {
    turns: 10,
    realTurns: 8,
    demoTurns: 2,
    rowsWithUsage: 9,
    rowsWithCacheField: 8,
    tokensIn: 100_000,
    cachedTokens: 73_000,
    ...over,
  };
}

describe('savingsFromAggregates（节省账单口径）', () => {
  it('命中率 = cached / tokensIn，且永远 ≤ 1', () => {
    const s = savingsFromAggregates(agg({ cachedTokens: 73_000, tokensIn: 100_000 }));
    expect(s.hitRate).toBeCloseTo(0.73, 5);
    expect(s.savedShare).toBeCloseTo(0.73, 5);
  });

  it('cached 超过 tokensIn 时收敛到 100%（脏账本不产生 >100%）', () => {
    const s = savingsFromAggregates(agg({ cachedTokens: 150_000, tokensIn: 100_000 }));
    expect(s.hitRate).toBe(1);
  });

  it('tokensIn = 0 时命中率为 null（渲染 —），不是 0%', () => {
    const s = savingsFromAggregates(agg({ tokensIn: 0, cachedTokens: 0 }));
    expect(s.hitRate).toBeNull();
    expect(s.savedShare).toBeNull();
  });

  it('旧账本（usage 有值、没有 cachedTokens 键）计入 legacyRows，不冒充 0 命中', () => {
    const s = savingsFromAggregates(agg({ rowsWithUsage: 9, rowsWithCacheField: 4 }));
    expect(s.legacyRows).toBe(5);
  });

  it('legacyRows 不为负（账对不齐时按 0 报，不炸）', () => {
    const s = savingsFromAggregates(agg({ rowsWithUsage: 2, rowsWithCacheField: 9 }));
    expect(s.legacyRows).toBe(0);
  });

  it('非有限输入收敛到 0（NaN / 负数 / Infinity）', () => {
    const s = savingsFromAggregates(agg({ tokensIn: Number.NaN, cachedTokens: Number.POSITIVE_INFINITY, turns: -3 }));
    expect(s.tokensIn).toBe(0);
    expect(s.cachedTokens).toBe(0);
    expect(s.turns).toBe(0);
    expect(s.hitRate).toBeNull();
  });

  it('全空项目：turns 0、命中率 null——卡片会渲染空态，不写 0%', () => {
    const s = savingsFromAggregates(agg({ turns: 0, realTurns: 0, demoTurns: 0, rowsWithUsage: 0, rowsWithCacheField: 0, tokensIn: 0, cachedTokens: 0 }));
    expect(s).toMatchObject({ turns: 0, cachedTokens: 0, hitRate: null, legacyRows: 0 });
  });
});
